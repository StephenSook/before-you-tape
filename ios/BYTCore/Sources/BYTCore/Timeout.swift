import Foundation

/// Every model call has a time limit (a FoundationModels call once stalled for 44 minutes on a
/// Mac). Returns nil on timeout, without waiting for a call that ignores cancellation.
public enum Timeout {
    public static func run<T: Sendable>(seconds: Double, _ op: @escaping @Sendable () async -> T) async -> T? {
        let once = ResumeOnce<T?>()
        return await withCheckedContinuation { continuation in
            let work = Task {
                let value = await op()
                once.resume(continuation, with: value)
            }
            Task {
                try? await Task.sleep(for: .seconds(seconds))
                if once.resume(continuation, with: nil) { work.cancel() }
            }
        }
    }
}

/// Resumes a continuation exactly once, whichever side gets there first.
final class ResumeOnce<T: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false

    @discardableResult
    func resume(_ continuation: CheckedContinuation<T, Never>, with value: T) -> Bool {
        lock.lock()
        let first = !done
        done = true
        lock.unlock()
        if first { continuation.resume(returning: value) }
        return first
    }
}
