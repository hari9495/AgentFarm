// ============================================================================
// MOBILE SWIFT BUILDER
// SwiftUI component generation, URLSession API clients, XCTest helpers.
// Pure functions — no side-effects.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwiftGeneratedFile {
    filename:  string;   // e.g. "UserCard.swift"
    content:   string;
    isTest:    boolean;
    isPreview: boolean;  // SwiftUI #Preview
}

export interface iOSApiEndpoint {
    method:       'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path:         string;
    requestType?: string;   // Swift type name
    responseType: string;
}

// ---------------------------------------------------------------------------
// buildSwiftUIComponentPrompt
// ---------------------------------------------------------------------------

/**
 * LLM prompt for generating a SwiftUI view component. Pure function.
 */
export function buildSwiftUIComponentPrompt(params: {
    componentName: string;
    description:   string;
    hasState?:     boolean;
    isAsync?:      boolean;
    props?:        Array<{ name: string; type: string; optional?: boolean }>;
    styling?:      'system' | 'custom';   // system = SF Symbols + system colours
    minTarget?:    string;                 // e.g. "iOS 16"
}): string {
    const propsList = (params.props ?? [])
        .map((p) => `  ${p.name}: ${p.type}${p.optional ? '?' : ''}`)
        .join('\n');

    return [
        `You are a senior iOS engineer writing production-quality SwiftUI code.`,
        `Minimum deployment target: ${params.minTarget ?? 'iOS 16'}`,
        ``,
        `Component: ${params.componentName}`,
        `Description: ${params.description}`,
        `Has internal state: ${params.hasState ? 'yes' : 'no'}`,
        `Is async (fetches data): ${params.isAsync ? 'yes' : 'no'}`,
        `Styling: ${params.styling ?? 'system'}`,
        ...(propsList ? [`\nProperties:\n${propsList}`] : []),
        ``,
        `Generate the SwiftUI view with:`,
        `  - Proper @State, @StateObject, @ObservedObject as needed`,
        `  - Async/await with .task modifier if async`,
        `  - Loading and error states if async`,
        `  - Accessibility labels and hints (VoiceOver ready)`,
        `  - A #Preview macro at the bottom`,
        `  - An XCTest unit test file`,
        ``,
        `Return a JSON array where each element has:`,
        `  filename   — e.g. "${params.componentName}.swift"`,
        `  content    — the Swift source code`,
        `  isTest     — true for test files`,
        `  isPreview  — true if file contains #Preview`,
        ``,
        `No markdown fences, no prose — only the JSON array.`,
    ].join('\n');
}

/**
 * Parses the LLM Swift output into SwiftGeneratedFile[]. Pure function.
 */
export function parseSwiftOutput(raw: string, componentName: string): SwiftGeneratedFile[] {
    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start   = cleaned.indexOf('[');
    const end     = cleaned.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
        try {
            const items = JSON.parse(cleaned.slice(start, end + 1)) as Array<{
                filename?: unknown; content?: unknown; isTest?: unknown; isPreview?: unknown;
            }>;
            const results = items
                .filter((i) => typeof i.filename === 'string' && typeof i.content === 'string')
                .map((i) => ({
                    filename:  i.filename  as string,
                    content:   i.content   as string,
                    isTest:    i.isTest    === true,
                    isPreview: i.isPreview === true,
                }));
            if (results.length > 0) return results;
        } catch { /* fall through to stub */ }
    }
    // Fallback stub
    return [{
        filename:  `${componentName}.swift`,
        content:   `import SwiftUI\n\nstruct ${componentName}: View {\n    var body: some View {\n        Text("${componentName}")\n    }\n}\n\n#Preview {\n    ${componentName}()\n}\n`,
        isTest:    false,
        isPreview: true,
    }];
}

// ---------------------------------------------------------------------------
// buildiOSApiClientPrompt
// ---------------------------------------------------------------------------

/**
 * LLM prompt to generate a URLSession-based Swift API client. Pure function.
 */
export function buildiOSApiClientPrompt(params: {
    baseUrl:   string;
    endpoints: iOSApiEndpoint[];
    authType?: 'bearer' | 'api_key' | 'none';
    moduleName?: string;
}): string {
    const endpointList = params.endpoints.map((e) =>
        `  ${e.method} ${e.path} → ${e.responseType}${e.requestType ? ` (body: ${e.requestType})` : ''}`,
    ).join('\n');

    return [
        `You are a senior iOS engineer generating a Swift network layer using URLSession and async/await.`,
        ``,
        `Base URL: ${params.baseUrl}`,
        `Auth: ${params.authType ?? 'bearer'} token`,
        `Module: ${params.moduleName ?? 'APIClient'}`,
        ``,
        `Endpoints:`,
        endpointList,
        ``,
        `Generate:`,
        `  - APIClient actor/class with a shared singleton`,
        `  - Generic request<T: Decodable> method`,
        `  - Typed endpoint methods matching each route`,
        `  - NetworkError enum covering all failure cases`,
        `  - JSONDecoder with .convertFromSnakeCase`,
        `  - Auth header injection`,
        ``,
        `Return a JSON array of { filename, content, isTest, isPreview } objects.`,
        `No markdown fences, no prose — only the JSON array.`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// buildSwiftTestPrompt
// ---------------------------------------------------------------------------

/**
 * Generates an XCTest prompt for an existing Swift component. Pure function.
 */
export function buildSwiftTestPrompt(componentCode: string, componentName: string): string {
    return [
        `You are a senior iOS engineer writing XCTest unit tests.`,
        ``,
        `Source to test:`,
        '```swift',
        componentCode.slice(0, 3000),
        '```',
        ``,
        `Generate a complete XCTestCase subclass for ${componentName} that covers:`,
        `  - Happy path scenarios`,
        `  - Edge cases (empty, nil, boundary values)`,
        `  - Async operations with XCTestExpectation or async/await`,
        ``,
        `Return ONLY the Swift test file content — no JSON wrapper needed.`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// buildPushNotificationConfig
// ---------------------------------------------------------------------------

/**
 * Generates APNs push notification configuration snippets. Pure function.
 */
export function buildPushNotificationConfig(appBundleId: string, environment: 'sandbox' | 'production'): {
    appDelegateSnippet: string;
    entitlementsPlist:  string;
} {
    return {
        appDelegateSnippet: `
// Add to AppDelegate / App struct
import UserNotifications

func registerForPushNotifications() {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
        guard granted else { return }
        DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
    }
}

func application(_ application: UIApplication,
                 didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
    // Send token to your backend: POST /api/devices { token, platform: "ios" }
    print("APNs token: \\(token)")
}
`.trim(),
        entitlementsPlist: `
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>aps-environment</key>
    <string>${environment}</string>
    <key>application-identifier</key>
    <string>${appBundleId}</string>
</dict>
</plist>
`.trim(),
    };
}
