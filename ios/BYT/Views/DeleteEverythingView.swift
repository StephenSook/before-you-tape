import SwiftUI

/// The steps of "Delete everything on this iPhone", in order.
enum DeleteStep: Equatable, Sendable { case box, signIn }

/// What happened to the anonymous sign-in once the box was deleted.
enum SignInOutcome: Equatable, Sendable {
    case deleted, signedOut
    /// There was no sign-in.
    case none
}

/// The end of "Delete everything on this iPhone": done, or stopped at the step named.
enum DeleteResult: Equatable, Sendable {
    case done(signIn: SignInOutcome)
    case stopped(at: DeleteStep)
}

/// The words of "Delete everything on this iPhone", the web app's where it has them
/// (src/pages/PackPage.tsx, src/ui/DeleteBoxPanel.tsx).
enum DeleteEverything {
    static let button = "Delete everything on this iPhone"
    static let ask = "This deletes your box and every item in it, your cloud choice and this iPhone's anonymous sign-in. It cannot be undone."
    static let delete = "Delete"
    static let keep = "Keep"
    static let working = "Deleting everything on this iPhone."
    static let tryAgain = "Try deleting again"
    static let signInDeletedLine = " So is your anonymous sign-in."
    static let signedOutLine = " Your anonymous sign-in could not be deleted right away; Firebase may delete it automatically any time after it is 30 days old."

    static func done(_ signIn: SignInOutcome) -> String {
        "Everything on this iPhone is deleted." + (signIn == .deleted ? signInDeletedLine : signIn == .signedOut ? signedOutLine : "")
    }

    static func left(_ step: DeleteStep) -> String {
        switch step {
        case .box: "Your box could not be fully deleted. Try again."
        case .signIn: "Your box is deleted, but your anonymous sign-in could not be. Try again."
        }
    }
}

/// Asks first, then deletes; says what is done only once every step is, and what is left when a step
/// stops, with a retry that starts there.
struct DeleteEverythingView: View {
    let model: AppModel
    @State private var stage: Stage = .idle
    @State private var left: DeleteStep?
    @State private var done: SignInOutcome?

    enum Stage { case idle, asking, working }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let done {
                Text(DeleteEverything.done(done)).accessibilityIdentifier("deleted-everything")
            }
            if let left {
                Text(DeleteEverything.left(left)).accessibilityIdentifier("delete-left")
                Button(DeleteEverything.tryAgain) { Task { await run(from: left) } }.buttonStyle(.bordered)
            }
            switch stage {
            case .idle where left == nil:
                Button(DeleteEverything.button, role: .destructive) { done = nil; stage = .asking }
                    .buttonStyle(.borderless)
            case .asking:
                Text(DeleteEverything.ask)
                HStack {
                    Button(DeleteEverything.delete, role: .destructive) { Task { await run(from: .box) } }.buttonStyle(.bordered)
                    Button(DeleteEverything.keep) { stage = .idle }.buttonStyle(.borderless)
                }
            case .working:
                Text(DeleteEverything.working)
            default:
                EmptyView()
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("delete-everything")
    }

    private func run(from step: DeleteStep) async {
        stage = .working
        left = nil
        switch await model.deleteEverything(from: step) {
        case let .done(signIn): done = signIn
        case let .stopped(at: step): left = step
        }
        stage = .idle
    }
}
