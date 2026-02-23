package com.example.samplecredentialwallet.utils


import android.util.Log
import io.mosip.pixelpass.PixelPass
import io.mosip.pixelpass.types.ECC

class PixelPassModule {
    private val pixelPass = PixelPass()
    private val TAG = "PixelPassModule"

    fun generateQRData(credentialData: String, header: String = ""): String {
        return pixelPass.generateQRData(credentialData, header)
    }

    fun generateQRCode(credentialData: String, header: String = "", ecc: ECC = ECC.L): String {
        return pixelPass.generateQRCode(credentialData, ecc, header)
    }

    /**
     * Decode base64url-encoded CBOR data (mso_mdoc format) to JSON string.
     * Uses PixelPass.toJson() which handles the CBOR -> JSON conversion.
     */
    fun decodeBase64UrlEncodedCBORData(data: String): String {
        return try {
            val decodedData = pixelPass.toJson(data)
            Log.d(TAG, "Successfully decoded CBOR data")
            decodedData.toString()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to decode CBOR data: ${e.message}", e)
            throw e
        }
    }
}