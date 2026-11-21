import FirebaseAuth
import Foundation

/// Anonymous sign-in, made testable: `ensure` signs in once when needed and says whether the
/// app is signed in afterwards.
@MainActor
struct SignIn {
    let isSignedIn: () -> Bool
    let attempt: () async -> Bool
    /// Deletes the anonymous sign-in, or signs it out when Firebase wants a recent sign-in first.
    var delete: () async -> SignInDeletion = { .none }

    func ensure() async -> Bool {
        if isSignedIn() { return true }
        return await attempt()
    }

    static func firebase() -> SignIn {
        SignIn(isSignedIn: { Auth.auth().currentUser != nil },
               attempt: { (try? await Auth.auth().signInAnonymously()) != nil },
               delete: {
                   guard let user = Auth.auth().currentUser else { return .none }
                   do {
                       try await user.delete()
                       return .deleted
                   } catch let error as NSError where AuthErrorCode(rawValue: error.code) == .requiresRecentLogin {
                       // An anonymous sign-in cannot sign in again to prove itself, so it is signed out instead;
                       // Firebase deletes unused anonymous sign-ins on its own (as the web app does).
                       do {
                           try Auth.auth().signOut()
                           return .signedOut
                       } catch {
                           return .failed
                       }
                   } catch {
                       return .failed
                   }
               })
    }
}

/// What deleting the anonymous sign-in did.
enum SignInDeletion: Equatable, Sendable {
    case deleted, signedOut, failed
    /// There was no sign-in to delete.
    case none
}
