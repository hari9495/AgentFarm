export interface TwilioCallOptions {
    accountSid: string;
    authToken: string;
    fromNumber: string;
    toNumber: string;
    answerWebhookUrl: string;
    statusCallbackUrl: string;
}

export interface TwilioCallResult {
    callSid: string;
    status: string;
    error?: string;
}

export async function initiateCall(options: TwilioCallOptions): Promise<TwilioCallResult> {
    const { accountSid, authToken, fromNumber, toNumber, answerWebhookUrl, statusCallbackUrl } = options;

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const params = new URLSearchParams({
        From: fromNumber,
        To: toNumber,
        Url: answerWebhookUrl,
        Method: 'POST',
        StatusCallback: statusCallbackUrl,
        StatusCallbackMethod: 'POST',
    });

    const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
        {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        },
    );

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
            callSid: '',
            status: 'failed',
            error: `Twilio error ${res.status}: ${errText.slice(0, 200)}`,
        };
    }

    const data = await res.json() as { sid: string; status: string };
    return { callSid: data.sid, status: data.status };
}

// Build minimal TwiML for the opening turn (served on call answer)
export function buildAnswerTwiml(script: string, nextTurnUrl: string): string {
    const safe = escapeXml(script);
    const safeUrl = escapeXml(nextTurnUrl);
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        `  <Gather input="speech" action="${safeUrl}" method="POST" speechTimeout="3" timeout="10">`,
        `    <Say voice="Polly.Joanna">${safe}</Say>`,
        '  </Gather>',
        '  <Say voice="Polly.Joanna">I\'ll follow up by email. Thanks for your time!</Say>',
        '  <Hangup/>',
        '</Response>',
    ].join('\n');
}

// Build TwiML for a conversation turn response
export function buildTurnTwiml(agentText: string, nextTurnUrl: string, shouldHangUp: boolean): string {
    const safe = escapeXml(agentText);
    if (shouldHangUp) {
        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<Response>',
            `  <Say voice="Polly.Joanna">${safe}</Say>`,
            '  <Hangup/>',
            '</Response>',
        ].join('\n');
    }
    const safeUrl = escapeXml(nextTurnUrl);
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        `  <Gather input="speech" action="${safeUrl}" method="POST" speechTimeout="3" timeout="10">`,
        `    <Say voice="Polly.Joanna">${safe}</Say>`,
        '  </Gather>',
        '  <Say voice="Polly.Joanna">Thanks for your time. I\'ll send more information by email!</Say>',
        '  <Hangup/>',
        '</Response>',
    ].join('\n');
}

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
