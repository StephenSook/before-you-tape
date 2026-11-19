import FirebaseAuth
import Foundation

/// Anonymous sign-in, made testable: `ensure` signs in once when needed and says whether the
/// app is signed in afterwards.
@MainActor
struct SignIn {
    let isSignedIn: () -> Bool
    let attempt: () async -> Bool

    func ensure() async -> Bool {
        if isSignedIn() { return true }
        return await attempt()
    }

    static func firebase() -> SignIn {
        SignIn(isSignedIn: { Auth.auth().currentUser != nil },
               attempt: { (try? await Auth.auth().signInAnonymously()) != nil })
    }
}
