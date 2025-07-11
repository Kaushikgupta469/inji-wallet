import {NativeModules} from 'react-native';
import {__AppId} from '../GlobalVariables';
import {
  SelectedCredentialsForVPSharing,
  VC,
} from '../../machines/VerifiableCredential/VCMetaMachine/vc';
import {walletMetadata} from './walletMetadata';
import {getWalletMetadata, isClientValidationRequired} from './OpenID4VPHelper';
import {parseJSON} from '../Utils';

export const OpenID4VP_Proof_Sign_Algo = 'EdDSA';

class OpenID4VP {
  private static instance: OpenID4VP;
  private InjiOpenID4VP = NativeModules.InjiOpenID4VP;

  private constructor() {
    this.InjiOpenID4VP.init(__AppId.getValue());
  }

  public static getInstance(): OpenID4VP {
    if (!OpenID4VP.instance) {
      OpenID4VP.instance = new OpenID4VP();
    }
    return OpenID4VP.instance;
  }

  async authenticateVerifier(
    urlEncodedAuthorizationRequest: string,
    trustedVerifiersList: any,
  ) {
    const shouldValidateClient = await isClientValidationRequired();
    const metadata = (await getWalletMetadata()) || walletMetadata;

    const authenticationResponse =
      await this.InjiOpenID4VP.authenticateVerifier(
        urlEncodedAuthorizationRequest,
        trustedVerifiersList,
        metadata,
        shouldValidateClient,
      );
    return JSON.parse(authenticationResponse);
  }

  async constructUnsignedVPToken(
    selectedVCs: Record<string, VC[]>,
    holderId: string,
    signatureAlgorithm: string,
  ) {
    const updatedSelectedVCs = this.processSelectedVCs(selectedVCs);
    const unSignedVpTokens = await this.InjiOpenID4VP.constructUnsignedVPToken(
      updatedSelectedVCs,
      holderId,
      signatureAlgorithm,
    );
    return parseJSON(unSignedVpTokens);
  }

  async shareVerifiablePresentation(
    vpTokenSigningResultMap: Record<string, any>,
  ) {
    return await this.InjiOpenID4VP.shareVerifiablePresentation(
      vpTokenSigningResultMap,
    );
  }

  sendErrorToVerifier(errorMessage: string, errorCode: string) {
    this.InjiOpenID4VP.sendErrorToVerifier(errorMessage, errorCode);
  }

  private processSelectedVCs(selectedVCs: Record<string, VC[]>) {
    const selectedVcsData: SelectedCredentialsForVPSharing = {};
    Object.entries(selectedVCs).forEach(([inputDescriptorId, vcsArray]) => {
      vcsArray.forEach(vcData => {
        const credentialFormat = vcData.vcMetadata.format;
        const credential = vcData.verifiableCredential.credential;
        if (!selectedVcsData[inputDescriptorId]) {
          selectedVcsData[inputDescriptorId] = {};
        }
        if (!selectedVcsData[inputDescriptorId][credentialFormat]) {
          selectedVcsData[inputDescriptorId][credentialFormat] = [];
        }
        selectedVcsData[inputDescriptorId][credentialFormat].push(credential);
      });
    });
    return selectedVcsData;
  }
}

export default OpenID4VP;
