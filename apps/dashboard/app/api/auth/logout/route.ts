import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
    const response = NextResponse.json({ message: 'Logged out.' });
    response.cookies.set('agentfarm_internal_session', '', {
        path: '/',
        sameSite: 'strict',
        maxAge: 0,
        httpOnly: false,
    });
    return response;
}
