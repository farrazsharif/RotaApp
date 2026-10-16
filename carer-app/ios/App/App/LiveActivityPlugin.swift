import ActivityKit
import Capacitor
import Foundation

// Bridges ActivityKit to the web layer so the app can show a live timer on the
// Lock Screen / Dynamic Island while a carer is clocked in.
//
// Deliberately driven locally (no push), so it works with no signal — which
// matters, since carers clock in inside buildings with no reception.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["started": false, "reason": "unsupported"])
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            // The carer has Live Activities switched off for this app.
            call.resolve(["started": false, "reason": "disabled"])
            return
        }

        let clientName = call.getString("clientName") ?? "Visit"
        let visitName = call.getString("visitName") ?? ""
        let startedAtMs = call.getDouble("startedAt") ?? (Date().timeIntervalSince1970 * 1000)
        let endsAtMs = call.getDouble("endsAt")

        let attributes = VisitActivityAttributes(clientName: clientName, visitName: visitName)
        let state = VisitActivityAttributes.ContentState(
            startedAt: Date(timeIntervalSince1970: startedAtMs / 1000),
            endsAt: endsAtMs.map { Date(timeIntervalSince1970: $0 / 1000) }
        )

        Task {
            // Only ever show one visit, so a stale card can't linger.
            await Self.endAll()
            do {
                _ = try Activity.request(
                    attributes: attributes,
                    content: ActivityContent(state: state, staleDate: nil),
                    pushType: nil
                )
                call.resolve(["started": true])
            } catch {
                call.resolve(["started": false, "reason": error.localizedDescription])
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        Task {
            await Self.endAll()
            call.resolve()
        }
    }

    @available(iOS 16.2, *)
    private static func endAll() async {
        for activity in Activity<VisitActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
