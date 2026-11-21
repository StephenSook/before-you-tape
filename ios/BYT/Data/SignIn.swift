import FirebaseAuth
import Foundation

/// Anonymous sign-in, made testable: `ensure` signs in once when needed and says whether the
/// app is signed in afterwards.
@MainActor
struct SignIn {
    let isSignedIn: () -> Bool
    let attempt: () async -> Bool
    /// Deletes the anonymous sign-in, or signs it out when Firebase wants a recent sign-in first. Given the
    /// user expected (the one current when "Delete everything" began), it deletes only that one: when
    /// another is signed in by now, that one is signed out instead.
    var delete: (_ expected: String?) async -> SignInDeletion = { _ in .none }
    /// The user signed in now, if any.
    var currentUid: () -> String? = { nil }
    /// Waits for a sign-in in progress, if any, so nothing is deleted while one is still landing.
    var settle: () async -> Void = {}

    func ensure() async -> Bool {
        if isSignedIn() { return true }
        return await attempt()
    }

    static func firebase() -> SignIn {
        let gate = SignInGate()
        return SignIn(isSignedIn: { Auth.auth().currentUser != nil },
                      attempt: { await gate.signIn() },
                      delete: { expected in
                          guard let user = Auth.auth().currentUser else { return .none }
                          // The user recorded at the start is no longer this iPhone's: the one here now is
                          // signed out, not deleted, and Firebase deletes unused anonymous sign-ins on its own.
                          if let expected, user.uid != expected {
                              do {
                                  try Auth.auth().signOut()
                                  return .signedOut
                              } catch {
                                  return .failed
                              }
                          }
                          do {
                              try await user.delete()
                              return .deleted
                          } catch let error as NSError where AuthErrorCode(rawValue: error.code) == .requiresRecentLogin {
                              // An anonymous sign-in cannot sign in again to prove itself, so it is signed out
                              // instead; Firebase deletes unused anonymous sign-ins on its own (as the web app does).
                              do {
                                  try Auth.auth().signOut()
                                  return .signedOut
                              } catch {
                                  return .failed
                              }
                          } catch {
                              return .failed
                          }
                      },
                      currentUid: { Auth.auth().currentUser?.uid },
                      settle: { await gate.settle() })
    }
}

/// One anonymous sign-in at a time: callers that ask while one is running wait for it, so two callers
/// never make two accounts, and a delete can wait for the one in progress.
@MainActor
final class SignInGate {
    private var running: Task<Bool, Never>?

    func signIn() async -> Bool {
        if let running { return await running.value }
        let task = Task { (try? await Auth.auth().signInAnonymously()) != nil }
        running = task
        let signedIn = await task.value
        running = nil
        return signedIn
    }

    func settle() async {
        if let running { _ = await running.value }
    }
}

/// What deleting the anonymous sign-in did.
enum SignInDeletion: Equatable, Sendable {
    case deleted, signedOut, failed
    /// There was no sign-in to delete.
    case none
}
