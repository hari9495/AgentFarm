// ============================================================================
// MOBILE KOTLIN BUILDER
// Jetpack Compose component generation, Retrofit API clients, test helpers.
// Pure functions — no side-effects.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KotlinGeneratedFile {
    filename:  string;   // e.g. "UserCard.kt"
    content:   string;
    isTest:    boolean;
    isPreview: boolean;  // @Preview composable
}

export interface AndroidApiEndpoint {
    method:       'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path:         string;
    requestType?: string;
    responseType: string;
    isForm?:      boolean;
}

// ---------------------------------------------------------------------------
// buildComposeComponentPrompt
// ---------------------------------------------------------------------------

/**
 * LLM prompt for generating a Jetpack Compose component. Pure function.
 */
export function buildComposeComponentPrompt(params: {
    componentName: string;
    description:   string;
    hasState?:     boolean;
    isAsync?:      boolean;
    props?:        Array<{ name: string; type: string; optional?: boolean }>;
    minSdk?:       number;
    useMaterial3?: boolean;
}): string {
    const propsList = (params.props ?? [])
        .map((p) => `  ${p.name}: ${p.type}${p.optional ? '? = null' : ''}`)
        .join('\n');

    return [
        `You are a senior Android engineer writing production-quality Jetpack Compose code.`,
        `Minimum SDK: ${params.minSdk ?? 26}`,
        `Material Design: ${params.useMaterial3 !== false ? '3' : '2'}`,
        ``,
        `Component: ${params.componentName}`,
        `Description: ${params.description}`,
        `Has internal state: ${params.hasState ? 'yes' : 'no'}`,
        `Is async (fetches data): ${params.isAsync ? 'yes' : 'no'}`,
        ...(propsList ? [`\nParameters:\n${propsList}`] : []),
        ``,
        `Generate a Composable with:`,
        `  - remember / mutableStateOf for internal state`,
        `  - LaunchedEffect + coroutines if async`,
        `  - Loading and error states with proper UX if async`,
        `  - Accessibility semantics (contentDescription, semantics {})`,
        `  - A @Preview annotated composable at the bottom`,
        `  - A companion ViewModel if the component is async`,
        `  - A JUnit4 Compose UI test file`,
        ``,
        `Return a JSON array where each element has:`,
        `  filename   — e.g. "${params.componentName}.kt"`,
        `  content    — the Kotlin source code`,
        `  isTest     — true for test files`,
        `  isPreview  — true if file contains @Preview`,
        ``,
        `No markdown fences, no prose — only the JSON array.`,
    ].join('\n');
}

/**
 * Parses the LLM Kotlin output into KotlinGeneratedFile[]. Pure function.
 */
export function parseKotlinOutput(raw: string, componentName: string): KotlinGeneratedFile[] {
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
    return [{
        filename:  `${componentName}.kt`,
        content:   `import androidx.compose.material3.Text\nimport androidx.compose.runtime.Composable\nimport androidx.compose.ui.tooling.preview.Preview\n\n@Composable\nfun ${componentName}() {\n    Text(text = "${componentName}")\n}\n\n@Preview(showBackground = true)\n@Composable\nfun ${componentName}Preview() {\n    ${componentName}()\n}\n`,
        isTest:    false,
        isPreview: true,
    }];
}

// ---------------------------------------------------------------------------
// buildAndroidApiClientPrompt
// ---------------------------------------------------------------------------

/**
 * LLM prompt to generate a Retrofit + OkHttp Android API client. Pure function.
 */
export function buildAndroidApiClientPrompt(params: {
    baseUrl:    string;
    endpoints:  AndroidApiEndpoint[];
    authType?:  'bearer' | 'api_key' | 'none';
    moduleName?: string;
}): string {
    const endpointList = params.endpoints.map((e) =>
        `  @${e.method}("${e.path}") → ${e.responseType}${e.requestType ? ` (body: ${e.requestType})` : ''}`,
    ).join('\n');

    return [
        `You are a senior Android engineer generating a Retrofit + OkHttp network layer with Kotlin coroutines.`,
        ``,
        `Base URL: ${params.baseUrl}`,
        `Auth: ${params.authType ?? 'bearer'} token`,
        `Module: ${params.moduleName ?? 'ApiClient'}`,
        ``,
        `Endpoints:`,
        endpointList,
        ``,
        `Generate:`,
        `  - Retrofit interface with suspend functions for each endpoint`,
        `  - OkHttpClient with AuthInterceptor`,
        `  - Repository class wrapping the service with Result<T> return type`,
        `  - GsonConverterFactory or MoshiConverterFactory`,
        `  - Hilt module for dependency injection`,
        ``,
        `Return a JSON array of { filename, content, isTest, isPreview } objects.`,
        `No markdown fences, no prose — only the JSON array.`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// buildKotlinTestPrompt
// ---------------------------------------------------------------------------

/**
 * Generates a JUnit4 + Espresso / Compose UI test prompt. Pure function.
 */
export function buildKotlinTestPrompt(componentCode: string, componentName: string): string {
    return [
        `You are a senior Android engineer writing JUnit4 and Compose UI tests.`,
        ``,
        `Source to test:`,
        '```kotlin',
        componentCode.slice(0, 3000),
        '```',
        ``,
        `Generate a complete test class for ${componentName} that covers:`,
        `  - Happy path scenarios with composeTestRule`,
        `  - Edge cases (empty state, error state)`,
        `  - ViewModel unit tests with MockK or Mockito`,
        ``,
        `Return ONLY the Kotlin test file content.`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// buildFCMConfig
// ---------------------------------------------------------------------------

/**
 * Generates Firebase Cloud Messaging configuration snippets. Pure function.
 */
export function buildFCMConfig(applicationId: string): {
    serviceSnippet:  string;
    manifestSnippet: string;
} {
    return {
        serviceSnippet: `
// FirebaseMessagingService implementation
class PushNotificationService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Send token to your backend: POST /api/devices { token, platform: "android" }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        message.notification?.let { notification ->
            showNotification(notification.title ?: "", notification.body ?: "")
        }
    }

    private fun showNotification(title: String, body: String) {
        val channelId = "${applicationId}.default"
        val intent    = packageManager.getLaunchIntentForPackage(packageName)
        val pi        = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE)
        val builder   = NotificationCompat.Builder(this, channelId)
            .setContentTitle(title).setContentText(body)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pi).setAutoCancel(true)
        NotificationManagerCompat.from(this).notify(System.currentTimeMillis().toInt(), builder.build())
    }
}
`.trim(),
        manifestSnippet: `
<!-- Add inside <application> in AndroidManifest.xml -->
<service android:name=".PushNotificationService" android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
`.trim(),
    };
}

// ---------------------------------------------------------------------------
// buildMobileDeepLinkConfig
// ---------------------------------------------------------------------------

/**
 * Generates Android App Link / deep link configuration. Pure function.
 */
export function buildAndroidDeepLinkConfig(scheme: string, host: string, paths: string[]): {
    manifestSnippet: string;
    navGraphSnippet: string;
} {
    const intentFilters = paths.map((p) => `
        <intent-filter android:autoVerify="true">
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="${scheme}" android:host="${host}" android:pathPrefix="${p}" />
        </intent-filter>`).join('\n');

    return {
        manifestSnippet: `<!-- Add to your launcher Activity in AndroidManifest.xml -->\n${intentFilters.trim()}`,
        navGraphSnippet: paths.map((p) =>
            `<deepLink app:uri="${scheme}://${host}${p}" />`,
        ).join('\n'),
    };
}
