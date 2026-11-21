import Testing
@testable import BYT

/// The test journal is read by a test while fake runners add to it from other threads: every read
/// must see a whole array, never one being grown (a test once crashed with "Index out of range"
/// while waiting for "cloud start").
@Suite struct JournalTests {
    @Test func theJournalCanBeReadWhileRunnersAdd() async {
        let j = FakeItemRunner.Journal()
        await withTaskGroup(of: Void.self) { group in
            for t in 0..<8 {
                group.addTask { for i in 0..<2_000 { j.add("e\(t)-\(i)") } }
            }
            group.addTask { for _ in 0..<4_000 { _ = j.events.contains("never") } }
        }
        #expect(j.events.count == 16_000)
    }
}
