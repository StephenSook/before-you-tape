import Foundation

/// Every model call has a time limit (a FoundationModels call once stalled for 44 minutes on a
/// Mac). Returns nil on timeout, without waiting for a call that ignores cancellation. Cancelling the
/// caller cancels the call, so a cancelled read stops sending.
public enum Timeout {
    public static func run<T: Sendable>(seconds: Double, _ op: @escaping @Sendable () async -> T) async -> T? {
        let once = ResumeOnce<T?>()
        let work = WorkHandle()
        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                let task = Task {
                    let value = await op()
                    once.resume(continuation, with: value)
                }
                work.set(task)
                Task {
                    try? await Task.sleep(for: .seconds(seconds))
                    if once.resume(continuation, with: nil) { task.cancel() }
                }
            }
        } onCancel: {
            work.cancel()
        }
    }
}

/// The running call, cancellable from the caller's cancellation handler, even when that handler runs
/// before the call has started.
final class WorkHandle: @unchecked Sendable {
    private let lock = NSLock()
    private var task: Task<Void, Never>?
    private var cancelled = false

    func set(_ task: Task<Void, Never>) {
        lock.lock()
        self.task = task
        let cancelNow = cancelled
        lock.unlock()
        if cancelNow { task.cancel() }
    }

    func cancel() {
        lock.lock()
        cancelled = true
        let task = self.task
        lock.unlock()
        task?.cancel()
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
