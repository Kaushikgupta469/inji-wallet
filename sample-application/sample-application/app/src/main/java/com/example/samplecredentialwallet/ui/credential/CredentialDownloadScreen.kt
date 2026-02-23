package com.example.samplecredentialwallet.ui.credential

import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.example.samplecredentialwallet.navigation.Screen
import com.example.samplecredentialwallet.utils.AuthCodeHolder
import com.example.samplecredentialwallet.utils.Constants
import com.example.samplecredentialwallet.utils.CredentialStore
import com.example.samplecredentialwallet.utils.CredentialVerifier
import com.example.samplecredentialwallet.utils.SecureKeystoreManager
import com.example.samplecredentialwallet.utils.EndpointConfig
import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.crypto.ECDSASigner
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.ECKey
import com.nimbusds.jose.jwk.Curve
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import io.mosip.vciclient.VCIClient
import io.mosip.vciclient.authorizationCodeFlow.AuthorizationMethod
import io.mosip.vciclient.authorizationCodeFlow.clientMetadata.ClientMetadata
import io.mosip.vciclient.constants.OpenWebPageCallback
import io.mosip.vciclient.token.TokenRequest
import io.mosip.vciclient.token.TokenResponse
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.net.UnknownHostException
import java.util.Base64
import java.util.Date
import java.security.KeyStore
import java.security.PrivateKey
import java.security.interfaces.RSAPublicKey
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import com.example.samplecredentialwallet.utils.PixelPassModule


@Composable
fun CredentialDownloadScreen(
    navController: NavController,
    authCode: String? = null
) {
    val context = LocalContext.current
    // Initialize and ensure keys exist (hardware-backed when available)
    val keystoreManager = remember { SecureKeystoreManager.getInstance(context) }
    LaunchedEffect(Unit) {
        try {
            keystoreManager.initializeKeystore()
        } catch (e: Exception) {
            Log.e("CredentialDownload", "Keystore initialization failed: ${e.message}", e)
        }
    }
    val client = VCIClient("demo-123")
    val clientMetadata = ClientMetadata(
        clientId = Constants.clientId.toString(),
        redirectUri = Constants.redirectUri.toString()
    )

    var tokenResponseJson by remember { mutableStateOf<String?>(null) }
    val isLoading = remember { mutableStateOf(false) }
    val loadingMessage = remember { mutableStateOf("Downloading Credential...") }
    val errorMessage = remember { mutableStateOf<String?>(null) }
    val showError = remember { mutableStateOf(false) }

    Box(
        modifier = Modifier.fillMaxSize()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Top
        ) {
            Text(
                text = "Download Credential",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(16.dp))

            Text(
                "OpenID4VCI Flow",
                style = MaterialTheme.typography.titleMedium,
                color = Color.Gray
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Credential Type: ${Constants.credentialDisplayName ?: Constants.credentialTypeId}",
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    GlobalScope.launch(Dispatchers.IO) {
                        try {
                            withContext(Dispatchers.Main) {
                                isLoading.value = true
                                loadingMessage.value = "Starting credential download..."
                            }

                        withTimeout(600000L) { 
                            // DEBUG LOGGING
                            Log.d("VC_DOWNLOAD_DEBUG", "Calling fetchCredentialFromTrustedIssuer")
                            Log.d("VC_DOWNLOAD_DEBUG", "Issuer: ${Constants.credentialIssuerHost}")
                            Log.d("VC_DOWNLOAD_DEBUG", "ConfigID: ${Constants.credentialTypeId}")
                            Log.d("VC_DOWNLOAD_DEBUG", "ClientMetadata: ${clientMetadata.toString()}")

                            val credential = client.fetchCredentialFromTrustedIssuer(
                                credentialIssuer = Constants.credentialIssuerHost.toString(),
                                credentialConfigurationId = Constants.credentialTypeId.toString(),
                                clientMetadata = clientMetadata,
                                
                                authorizations = listOf(
                                    AuthorizationMethod.RedirectToWeb(
                                        openWebPage = openWebPage@{ endpoint ->
                                            Log.d("AUTH_FLOW", "Authorization flow started")
                                            Log.d("AUTH_FLOW", "Authorization URL: $endpoint")
                                            withContext(Dispatchers.Main) {
                                                loadingMessage.value = "Authenticating..."
                                            }
                                            
                                            val code = try {
                                                handleAuthorizationFlow(navController, endpoint)
                                            } catch (ex: Exception) {
                                                Log.e("AUTH_FLOW", "Authorization failed: ${ex.message}")
                                                return@openWebPage mapOf(
                                                    "error" to "authorization_failed",
                                                    "errorDescription" to (ex.message ?: "Failed to receive authorization code")
                                                )
                                            }
                                            
                                            if (code.isBlank()) {
                                                return@openWebPage mapOf(
                                                    "error" to "access_denied",
                                                    "errorDescription" to "Authorization code not received"
                                                )
                                            }
                                            
                                            Log.d("AUTH_FLOW", "Authorization code received")
                                            mapOf("code" to code)
                                        }
                                    )
                                ),
                                
                                getTokenResponse = { tokenRequest ->
                                    Log.d("TOKEN_EXCHANGE", "Token exchange started")
                                    Log.d("TOKEN_EXCHANGE", "Token endpoint: ${tokenRequest.tokenEndpoint}")
                                    withContext(Dispatchers.Main) {
                                        loadingMessage.value = "Exchanging tokens..."
                                    }

                                    // Resolve token endpoint using configuration
                                    val endpoint = EndpointConfig.resolveTokenEndpoint(
                                        tokenRequest.tokenEndpoint,
                                        Constants.credentialIssuerHost
                                    )
                                    Log.d("TOKEN_EXCHANGE", "Using custom endpoint: $endpoint")

                                    val response = sendTokenRequest(tokenRequest, endpoint)
                                    Log.d("TOKEN_EXCHANGE", "Access token received")
                                    Log.d("TOKEN_EXCHANGE", "c_nonce received")

                                    TokenResponse(
                                        accessToken = response.getString("access_token"),
                                        tokenType = response.getString("token_type"),
                                        expiresIn = response.optInt("expires_in"),
                                        cNonce = response.optString("c_nonce"),
                                        cNonceExpiresIn = response.optInt("c_nonce_expires_in")
                                    )
                                },
                                
                                getProofJwt = { issuer, cNonce, _ ->
                                    Log.d("PROOF_JWT", "Proof JWT generation started")
                                    Log.d("PROOF_JWT", "Issuer: $issuer")
                                    Log.d("PROOF_JWT", "c_nonce: $cNonce")
                                    
                                    // DEBUG LOGGING
                                    Log.d("PROOF_JWT_DEBUG", "Signing Params -> ClientID: ${Constants.clientId}, Audience: ${Constants.credentialIssuerHost ?: issuer}")

                                    withContext(Dispatchers.Main) {
                                        loadingMessage.value = "Generating proof..."
                                    }
                                    val proofJwt = signProofJWT(cNonce, issuer, isTrusted = true, context = context)
                                    Log.d("PROOF_JWT_DEBUG", "Proof JWT Generated (First 30 chars): ${proofJwt.take(30)}...")
                                    proofJwt
                                }
                            )

                            Log.d("VC_DOWNLOAD", "Credential download completed")
                            Log.d("VC_DOWNLOAD", "Credential object received: ${credential?.javaClass?.simpleName}")

                            withContext(Dispatchers.Main) {
                                loadingMessage.value = "Processing credential..."
                                
                                if (credential == null) {
                                    Log.e("VC_DOWNLOAD", "Credential is null")
                                    isLoading.value = false
                                    showError.value = true
                                    errorMessage.value = "Something went wrong!"
                                    return@withContext
                                }
                                
                                credential.let { credObj ->
                                    // Extract credential string (handling CredentialResponse wrapper if present)
                                    val credentialStr = try {
                                        val raw = credObj.credential.toString()
                                        if (raw.startsWith("CredentialResponse(")) {
                                            val match = Regex("credential=\"([^\"]+)\"").find(raw)
                                                ?: Regex("credential=([^,)]+)").find(raw)
                                            match?.groupValues?.get(1) ?: raw
                                        } else {
                                            raw
                                        }
                                    } catch (e: Exception) {
                                        Log.e("VC_EXTRACT", "Failed to extract credential: ${e.message}")
                                        credObj.credential.toString()
                                    }

                                    Log.d("VC_EXTRACT", "Credential extracted successfully")
                                    Log.d("VC_EXTRACT", "Credential length: ${credentialStr.length} characters")
                                    tokenResponseJson = credentialStr

                                    val isMsoMdoc = Constants.credentialFormat == "mso_mdoc"
                                    Log.d("VC_FORMAT", "Credential format: ${Constants.credentialFormat}, isMsoMdoc: $isMsoMdoc")

                                    Log.d("VC_VERIFY", "Starting credential verification")
                                    val verified = CredentialVerifier.verifyCredential(
                                        credentialStr,
                                        demoMode = true,
                                        format = Constants.credentialFormat ?: "ldp_vc"
                                    )
                                    Log.d("VC_VERIFY", "Verification result: $verified")
                                    
                                    // Build the credential for storage
                                    val credentialWithMetadata = if (isMsoMdoc) {
                                        // mso_mdoc: decode CBOR using PixelPass and store as JSON with metadata
                                        try {
                                            Log.d("VC_STORE", "Decoding mso_mdoc CBOR data via PixelPass")
                                            val pixelPass = PixelPassModule()
                                            
                                            // DEBUG LOGGING
                                            Log.d("VC_STORE_DEBUG", "Raw Credential (First 200 chars): ${credentialStr.take(200)}")
                                            
                                            val decodedJson = pixelPass.decodeBase64UrlEncodedCBORData(credentialStr)
                                            Log.d("VC_STORE", "CBOR decoded successfully, length: ${decodedJson.length}")
                                            
                                            // DEBUG LOGGING
                                            Log.d("VC_STORE_DEBUG", "Decoded JSON: $decodedJson")
                                            
                                            // Wrap the decoded data with metadata
                                            val wrapper = org.json.JSONObject()
                                            wrapper.put("credentialName", Constants.credentialDisplayName ?: "Mobile Driving License")
                                            wrapper.put("credentialFormat", "mso_mdoc")
                                            wrapper.put("rawCredential", credentialStr)
                                            
                                            // Try to parse decoded JSON and merge fields
                                            try {
                                                val decoded = org.json.JSONObject(decodedJson)
                                                wrapper.put("decodedCredential", decoded)
                                                Log.d("VC_STORE", "Decoded mso_mdoc JSON merged into wrapper")
                                            } catch (e: Exception) {
                                                Log.w("VC_STORE", "Could not parse decoded CBOR as JSON object, storing as string")
                                                wrapper.put("decodedCredential", decodedJson)
                                            }
                                            
                                            wrapper.toString()
                                        } catch (e: Exception) {
                                            Log.e("VC_STORE", "CBOR decode failed, storing raw with metadata: ${e.message}")
                                            val wrapper = org.json.JSONObject()
                                            wrapper.put("credentialName", Constants.credentialDisplayName ?: "Mobile Driving License")
                                            wrapper.put("credentialFormat", "mso_mdoc")
                                            wrapper.put("rawCredential", credentialStr)
                                            wrapper.toString()
                                        }
                                    } else {
                                        // ldp_vc: existing JSON handling
                                        try {
                                            val credJson = org.json.JSONObject(credentialStr)
                                            Constants.credentialDisplayName?.let { displayName ->
                                                credJson.put("credentialName", displayName)
                                                Log.d("VC_STORE", "Added display name: $displayName")
                                            }
                                            credJson.toString()
                                        } catch (e: Exception) {
                                            Log.e("VC_STORE", "Failed to add display name: ${e.message}")
                                            credentialStr 
                                        }
                                    }
                                    
                                    // Store credential 
                                    Log.d("VC_STORE", "Storing credential in credential store")
                                    CredentialStore.addCredential(credentialWithMetadata)
                                    Log.d("VC_STORE", "Credential stored successfully")
                                    isLoading.value = false
                                    
                                    // Navigate back to home screen
                                    navController.navigate(Screen.Home.route) {
                                        // Pop everything including auth_webview and credential_detail
                                        popUpTo(Screen.Home.route) { inclusive = true }
                                    }
                                }
                            }
                        }

                    } catch (e: Exception) {
                        Log.e("CredentialDownload", "Download failed: ${e.message}", e)
                        
                        // CRITICAL: Must switch to Main dispatcher to update UI state
                        withContext(Dispatchers.Main) {
                            isLoading.value = false
                            showError.value = true
                            
                            // Different error messages based on error type
                            errorMessage.value = when {
                                e is UnknownHostException -> "No internet connection"
                                e is java.net.SocketTimeoutException -> "No internet connection"
                                e is java.net.ConnectException -> "No internet connection"
                                e.message?.contains("Unable to resolve host", ignoreCase = true) == true -> "No internet connection"
                                e.message?.contains("timeout", ignoreCase = true) == true -> "No internet connection"
                                else -> "Something went wrong!"
                            }
                            
                            Log.e("CredentialDownload", "Error UI shown: ${errorMessage.value}")

                            // Also navigate away from AuthWebView so user doesn't get stuck on its loader
                            try {
                                navController.navigate(Screen.Home.route) {
                                    popUpTo(Screen.Home.route) { inclusive = true }
                                }
                            } catch (navE: Exception) {
                                Log.w("CredentialDownload", "Navigation after error failed: ${navE.message}")
                            }
                        }
                    } finally {
                        // Safety net: Must run on Main dispatcher
                        withContext(Dispatchers.Main) {
                            if (isLoading.value) {
                                isLoading.value = false
                                showError.value = true
                                errorMessage.value = "Something went wrong!"
                                Log.e("CredentialDownload", "Finally block: Error UI forced")
                            }
                        }
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading.value,
            colors = ButtonDefaults.buttonColors(
                containerColor = com.example.samplecredentialwallet.ui.theme.InjiOrange
            )
        ) {
            if (isLoading.value) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = Color.White
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Downloading...")
            } else {
                Text("Download Credential")
            }
        }
        }

        // Loading overlay
        if (isLoading.value) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.5f)),
                contentAlignment = Alignment.Center
            ) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = Color.White
                    ),
                    elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(48.dp),
                            color = com.example.samplecredentialwallet.ui.theme.InjiOrange
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = loadingMessage.value,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Please wait...",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray
                        )
                    }
                }
            }
        }
        
        // Error Screen Overlay
        if (showError.value && errorMessage.value != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.White),
                contentAlignment = Alignment.Center
            ) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFFFFF3E0) // Light orange background
                    ),
                    elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Error Icon
                        Icon(
                            imageVector = Icons.Default.Info,
                            contentDescription = "Error",
                            tint = Color(0xFFF57C00), // Orange color
                            modifier = Modifier.size(72.dp)
                        )
                        
                        Spacer(modifier = Modifier.height(24.dp))
                        
                        Text(
                            text = errorMessage.value ?: "Something went wrong!",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color.Black
                        )
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        Text(
                            text = if (errorMessage.value == "No internet connection") {
                                "Please check your internet connection and try again."
                            } else {
                                "We are having some trouble with your request. Please try again."
                            },
                            style = MaterialTheme.typography.bodyLarge,
                            color = Color.Gray,
                            modifier = Modifier.fillMaxWidth()
                        )
                        
                        Spacer(modifier = Modifier.height(32.dp))
                        
                        Button(
                            onClick = {
                                showError.value = false
                                errorMessage.value = null
                                navController.navigate(Screen.Home.route) {
                                    popUpTo(Screen.Home.route) { inclusive = true }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = com.example.samplecredentialwallet.ui.theme.InjiOrange
                            )
                        ) {
                            Text("Try again", fontSize = 16.sp)
                        }
                    }
                }
            }
        }
    }
}

suspend fun handleAuthorizationFlow(
    navController: NavController,
    url: String
): String {
    withContext(Dispatchers.Main) {
        navController.navigate(Screen.AuthWebView.createRoute(url))
    }
    val code = AuthCodeHolder.waitForCode()
    return code
}

private fun signProofJWT(
    cNonce: String?,
    issuer: String,
    isTrusted: Boolean,
    context: android.content.Context
): String {
    // Validate required dynamic inputs
    val nonNullNonce = cNonce?.trim()?.takeIf { it.isNotEmpty() }
        ?: throw IllegalStateException("c_nonce missing from token response; cannot build proof JWT")
    val clientId = Constants.clientId?.takeIf { it.isNotBlank() }
        ?: throw IllegalStateException("clientId not initialized in Constants; call the appropriate ViewModel setup before starting download")

    val manager = SecureKeystoreManager.getInstance(context)
    val useEc = manager.hasKey(SecureKeystoreManager.KeyType.ES256)
    val useRsa = manager.hasKey(SecureKeystoreManager.KeyType.RS256)

    if (!useEc && !useRsa) {
        throw IllegalStateException("No keystore key available. Initialize keystore before signing.")
    }

    // Prioritize EC (ES256) for mDL as per ISO 18013-5 recommendations and server requirement (eccr1)
    val (alg, publicJwk) = if (useEc) {
        JWSAlgorithm.ES256 to buildPublicEcJwkFromAndroid(SecureKeystoreManager.KeyType.ES256.value)
    } else {
        JWSAlgorithm.RS256 to buildPublicRsaJwkFromAndroid(SecureKeystoreManager.KeyType.RS256.value)
    }

    Log.d("PROOF_JWT", "Algorithm: $alg")
    Log.d("PROOF_JWT", "Public key type: ${publicJwk.keyType}")

    val header = JWSHeader.Builder(alg)
        .type(JOSEObjectType("openid4vci-proof+jwt"))
        .jwk(publicJwk)
        .build()

    Log.d("PROOF_JWT", "JWT Header created with type: openid4vci-proof+jwt")

    val audience = (Constants.credentialIssuerHost ?: issuer)

    val now = System.currentTimeMillis()
    val claimsSet = JWTClaimsSet.Builder()
        .issuer(clientId)
        .audience(audience)
        .claim("nonce", nonNullNonce)
        .issueTime(Date(now))
        .expirationTime(Date(now + 3 * 60 * 1000))
        .build()

    // DEBUG LOGGING
    Log.d("PROOF_JWT_DEBUG", "JWT Claims: ${claimsSet.toJSONObject()}")

    // Note: JWT claims contain sensitive data (nonce, etc.) - avoid logging in production

    Log.d("PROOF_JWT", "Signing JWT with algorithm: $alg")
    val signedJWT = SignedJWT(header, claimsSet).apply {
        if (alg == JWSAlgorithm.RS256) {
            val privateKey = loadPrivateKey(SecureKeystoreManager.KeyType.RS256.value)
            sign(RSASSASigner(privateKey))
            Log.d("PROOF_JWT", "Signed with RS256 private key")
        } else {
            val privateKey = loadPrivateKey(SecureKeystoreManager.KeyType.ES256.value)
            // Use custom signer for Android Keystore EC keys
            sign(AndroidEcdsaSigner(privateKey))
            Log.d("PROOF_JWT", "Signed with ES256 private key")
        }
    }

    // Note: Serialized JWT contains sensitive proof - avoid logging in production

    return signedJWT.serialize()
}

private fun String.base64Url(): String {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(toByteArray())
}
private fun buildPublicRsaJwkFromAndroid(alias: String): RSAKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val cert = ks.getCertificate(alias)
        ?: throw IllegalStateException("No certificate for alias: $alias")
    val publicKey = cert.publicKey as? RSAPublicKey
        ?: throw IllegalStateException("Alias $alias is not an RSA key")
    return RSAKey.Builder(publicKey)
        .keyID(alias)
        .build()
}

private fun buildPublicEcJwkFromAndroid(alias: String): ECKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val cert = ks.getCertificate(alias)
        ?: throw IllegalStateException("No certificate for alias: $alias")
    val publicKey = cert.publicKey as? ECPublicKey
        ?: throw IllegalStateException("Alias $alias is not an EC key")
    return ECKey.Builder(Curve.P_256, publicKey)
        .keyID(alias)
        .build()
}

/**
 * Custom JWSSigner for Android Keystore EC keys which may not implement ECPrivateKey interface
 */
class AndroidEcdsaSigner(private val privateKey: java.security.PrivateKey) : com.nimbusds.jose.JWSSigner {
    override fun supportedJWSAlgorithms(): Set<com.nimbusds.jose.JWSAlgorithm> {
        return setOf(com.nimbusds.jose.JWSAlgorithm.ES256)
    }

    override fun getJCAContext(): com.nimbusds.jose.jca.JCAContext {
        return com.nimbusds.jose.jca.JCAContext()
    }

    override fun sign(header: com.nimbusds.jose.JWSHeader, signingInput: ByteArray): com.nimbusds.jose.util.Base64URL {
        val signature = java.security.Signature.getInstance("SHA256withECDSA")
        signature.initSign(privateKey)
        signature.update(signingInput)
        val derSignature = signature.sign()
        
        // Convert DER signature to JOSE format (R|S check)
        // Nimbus provides ECDSA.transcodeSignatureToConcat but it takes byte[]
        return com.nimbusds.jose.util.Base64URL.encode(
            com.nimbusds.jose.crypto.impl.ECDSA.transcodeSignatureToConcat(derSignature, 32)
        )
    }
}

private fun loadPrivateKey(alias: String): PrivateKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    return ks.getKey(alias, null) as? PrivateKey
        ?: throw IllegalStateException("Private key not found for alias: $alias")
}

suspend fun sendTokenRequest(
    tokenRequest: TokenRequest,
    tokenEndpoint: String
): JSONObject {
    val url = URL(tokenEndpoint)
    val conn = url.openConnection() as HttpURLConnection
    conn.requestMethod = "POST"
    conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
    conn.doOutput = true
    conn.connectTimeout = 15000
    conn.readTimeout = 15000

    // Helper function to URL-encode parameter values
    fun enc(value: String): String = URLEncoder.encode(value, "UTF-8")

    val formBody = buildString {
        append("grant_type=${enc(tokenRequest.grantType.value)}")
        tokenRequest.authCode?.let { append("&code=${enc(it)}") }
        tokenRequest.preAuthCode?.let { append("&pre-authorized_code=${enc(it)}") }
        tokenRequest.txCode?.let { append("&tx_code=${enc(it)}") }
        tokenRequest.clientId?.let { append("&client_id=${enc(it)}") }
        tokenRequest.redirectUri?.let { append("&redirect_uri=${enc(it)}") }
        tokenRequest.codeVerifier?.let { append("&code_verifier=${enc(it)}") }
    }

    try {
        conn.outputStream.use { os ->
            os.write(formBody.toByteArray())
        }

        val responseCode = conn.responseCode

        if (responseCode == HttpURLConnection.HTTP_OK) {
            val responseText = conn.inputStream.bufferedReader().readText()
            return JSONObject(responseText)
        } else {
            val errorText = conn.errorStream?.bufferedReader()?.readText() ?: "Unknown error"
            throw Exception("HTTP error $responseCode: $errorText")
        }
    } catch (e: Exception) {
        throw e
    } finally {
        conn.disconnect()
    }
}
