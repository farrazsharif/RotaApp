import ActivityKit
import SwiftUI
import WidgetKit

// The Lock Screen card shown while a carer is clocked in.
struct VisitLockScreenView: View {
    let context: ActivityViewContext<VisitActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Caremid")
                    .font(.caption).bold()
                    .foregroundStyle(.secondary)
                Spacer()
                Text(context.attributes.clientName)
                    .font(.caption).bold()
                    .lineLimit(1)
            }

            HStack(alignment: .firstTextBaseline) {
                Text(context.state.startedAt, style: .timer)
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Spacer()
                if let endsAt = context.state.endsAt {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("Ends").font(.caption2).foregroundStyle(.secondary)
                        Text(endsAt, style: .time).font(.headline)
                    }
                }
            }

            if !context.attributes.visitName.isEmpty {
                Text(context.attributes.visitName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding()
    }
}

struct CaremidVisitActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: VisitActivityAttributes.self) { context in
            VisitLockScreenView(context: context)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.attributes.clientName, systemImage: "person.fill")
                        .font(.caption)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let endsAt = context.state.endsAt {
                        Text("Ends \(endsAt, style: .time)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.startedAt, style: .timer)
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .frame(maxWidth: .infinity)
                }
            } compactLeading: {
                Image(systemName: "clock.fill")
            } compactTrailing: {
                Text(context.state.startedAt, style: .timer)
                    .monospacedDigit()
                    .frame(maxWidth: 44)
            } minimal: {
                Image(systemName: "clock.fill")
            }
        }
    }
}

@main
struct CaremidLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        CaremidVisitActivity()
    }
}
