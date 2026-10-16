import ActivityKit
import Foundation

// What a clocked-in visit shows on the Lock Screen / Dynamic Island.
// Compiled into BOTH the app (which starts and ends the activity) and the
// widget extension (which renders it), so the two agree on the shape.
@available(iOS 16.2, *)
struct VisitActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // When the carer clocked in — the timer counts up from here. iOS ticks
        // this natively, so it keeps counting with no updates from the app.
        var startedAt: Date
        // The visit's scheduled end, shown as "Ends 4:55 pm".
        var endsAt: Date?
    }

    var clientName: String
    var visitName: String
}
