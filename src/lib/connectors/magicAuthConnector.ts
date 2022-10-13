import { OAuthExtension } from '@magic-ext/oauth';
import {
  InstanceWithExtensions,
  MagicSDKAdditionalConfiguration,
  SDKBase,
} from '@magic-sdk/provider';
import {
  Chain, normalizeChainId,
  UserRejectedRequestError,
} from '@wagmi/core';
import { Magic } from 'magic-sdk';

import {BaseOptions, MagicConnector} from "./magicConnector";

interface MagicAuthOptions extends BaseOptions {
  additionalMagicOptions?: MagicSDKAdditionalConfiguration<
    string,
    OAuthExtension[]
    >;
}

export class MagicAuthConnector extends MagicConnector {
  magicSDK?: InstanceWithExtensions<SDKBase, OAuthExtension[]>;

  additionalMagicOptions: MagicSDKAdditionalConfiguration<
    string,
    OAuthExtension[]
    >

  constructor(config: { chains?: Chain[]; options: MagicAuthOptions }) {
    super(config);
    this.additionalMagicOptions = config.options.additionalMagicOptions;
  }

  async connect() {
    try {
      const provider = await this.getProvider();

      if (provider.on) {
        provider.on('accountsChanged', this.onAccountsChanged);
        provider.on('chainChanged', this.onChainChanged);
        provider.on('disconnect', this.onDisconnect);
      }

      // Check if there is a user logged in
      const isAuthenticated = await this.isAuthorized();

      // if there is a user logged in, return the user
      if (isAuthenticated) {
        return {
          provider,
          chain: {
            id: 0,
            unsupported: false,
          },
          account: await this.getAccount(),
        };
      }

      // open the modal and process the magic login steps
      if (!this.isModalOpen) {
        const output = await this.getUserDetailsByForm();
        const magic = this.getMagicSDK();

        // LOGIN WITH MAGIC LINK WITH OAUTH PROVIDER
        if (output.oauthProvider) {
          await magic.oauth.loginWithRedirect({
            provider: output.oauthProvider,
            redirectURI: this.oauthCallbackUrl || window.location.href,
          });
        }

        // LOGIN WITH MAGIC LINK WITH EMAIL
        if (output.email) {
          await magic.auth.loginWithMagicLink({
            email: output.email,
          });
        }

        // LOGIN WITH MAGIC LINK WITH PHONE NUMBER
        if (output.phoneNumber) {
          await magic.auth.loginWithSMS({
            phoneNumber: output.phoneNumber,
          });
        }

        const signer = await this.getSigner();
        const account = await signer.getAddress();

        return {
          account,
          chain: {
            id: 0,
            unsupported: false,
          },
          provider,
        };
      }
      throw new UserRejectedRequestError('User rejected request');
    } catch (error) {
      throw new UserRejectedRequestError('Something went wrong');
    }
  }

  async getChainId(): Promise<number> {
    const networkOptions = this.additionalMagicOptions?.network;
    if (typeof networkOptions === 'object') {
    const chainID = networkOptions.chainId;
    if (chainID) {
      return normalizeChainId(chainID);
    }
  }
  throw new Error('Chain ID is not defined');
  }

  getMagicSDK(): InstanceWithExtensions<SDKBase, OAuthExtension[]> {
    if (!this.magicSDK) {
      this.magicSDK = new Magic(this.magicOptions.apiKey, {
        ...this.additionalMagicOptions,
        extensions: [new OAuthExtension()],
      });
      return this.magicSDK;
    }
    return this.magicSDK;
  }
}
