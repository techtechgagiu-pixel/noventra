import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
export async function GET() { return NextResponse.redirect(`${config.appBaseUrl}/login`); }
