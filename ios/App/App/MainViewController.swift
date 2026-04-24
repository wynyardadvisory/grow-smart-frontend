import UIKit
import Capacitor
import AuthenticationServices
import WebKit
import StoreKit

class MainViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        print("🌱 capacitorDidLoad fired")
        guard let webView = bridge?.webView else {
            print("🌱 ERROR: bridge?.webView is nil")
            return
        }
        webView.configuration.userContentController.add(
            OAuthMessageHandler(viewController: self),
            name: "startOAuth"
        )
        print("🌱 startOAuth message handler registered")
    }

    // ── Native OAuth via ASWebAuthenticationSession ───────────────────────────
    func startNativeOAuth(oauthUrl: URL) {
        print("🌱 startNativeOAuth called with: \(oauthUrl)")
        let callbackScheme = "com.vercro.app"

        let session = ASWebAuthenticationSession(url: oauthUrl, callbackURLScheme: callbackScheme) { [weak self] callbackURL, error in
            guard let self = self else { return }
            guard error == nil, let callbackURL = callbackURL else {
                DispatchQueue.main.async {
                    self.postToJS("vercroOAuthError", data: ["message": error?.localizedDescription ?? "Cancelled"])
                }
                return
            }
            DispatchQueue.main.async {
                self.postToJS("vercroOAuthCallback", data: ["url": callbackURL.absoluteString])
            }
        }

        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        session.start()

        objc_setAssociatedObject(self, &AssociatedKeys.authSession, session, .OBJC_ASSOCIATION_RETAIN)
    }

    func postToJS(_ event: String, data: [String: String]) {
        let jsonData = try? JSONSerialization.data(withJSONObject: data)
        let jsonString = jsonData.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        let js = "window.dispatchEvent(new CustomEvent('\(event)', { detail: \(jsonString) }));"
        bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}

class OAuthMessageHandler: NSObject, WKScriptMessageHandler {
    weak var viewController: MainViewController?

    init(viewController: MainViewController) {
        self.viewController = viewController
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        print("🌱 OAuthMessageHandler received message: \(message.name)")
        guard message.name == "startOAuth",
              let body = message.body as? [String: Any],
              let urlString = body["url"] as? String,
              let oauthUrl = URL(string: urlString) else { return }
        viewController?.startNativeOAuth(oauthUrl: oauthUrl)
    }
}

extension MainViewController: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return view.window ?? ASPresentationAnchor()
    }
}

// ── StoreKit presentation context ─────────────────────────────────────────────
// Ensures the Apple payment sheet is presented on the correct window,
// not hidden behind the Capacitor WebView.
@available(iOS 15.0, *)
extension MainViewController: SKPaymentTransactionObserver {
    func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
        // RevenueCat handles all transaction processing.
        // This observer registration ensures the payment sheet
        // presents on the correct UIWindow.
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        SKPaymentQueue.default().add(self)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        SKPaymentQueue.default().remove(self)
    }
}

private enum AssociatedKeys {
    static var authSession: UInt8 = 0
}
