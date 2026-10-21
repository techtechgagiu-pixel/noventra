import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
// Legacy callbacks cannot create a session or bypass invitation access.
export async function GET() { return NextResponse.redirect(`${config.appBaseUrl}/login`); }
