package expo.modules.googlecredential

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class GoogleCredentialModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GoogleCredential")

    AsyncFunction("getIdToken") Coroutine { serverClientId: String, nonce: String ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val option = GetGoogleIdOption.Builder()
        .setServerClientId(serverClientId)
        .setFilterByAuthorizedAccounts(false)
        .setNonce(nonce)
        .build()
      val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
      val credential = try {
        CredentialManager.create(activity).getCredential(activity, request).credential
      } catch (e: GetCredentialCancellationException) {
        throw CodedException("ERR_CANCELED", "The user canceled Google sign-in", e)
      } catch (e: NoCredentialException) {
        throw CodedException("ERR_NO_CREDENTIAL", "No Google account is available", e)
      } catch (e: GetCredentialException) {
        throw CodedException("ERR_GOOGLE_CREDENTIAL", e.message ?: e.type, e)
      }
      if (credential !is CustomCredential ||
        credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
      ) {
        throw CodedException("ERR_GOOGLE_CREDENTIAL", "Unexpected credential type ${credential.type}", null)
      }
      GoogleIdTokenCredential.createFrom(credential.data).idToken
    }
  }
}
