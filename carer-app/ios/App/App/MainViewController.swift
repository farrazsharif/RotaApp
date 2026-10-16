import Capacitor
import UIKit

// Capacitor 8 does NOT scan the runtime for plugins: CapacitorBridge
// .registerPlugins() only registers the classes listed in the generated
// capacitor.config.json, and that list covers plugin *packages* only.
//
// A plugin defined inside the app target therefore has to be registered by
// hand, or the web layer just gets "plugin is not implemented on ios" - which
// is exactly what the Lock Screen timer hit.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
    }
}
