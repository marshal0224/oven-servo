export async function GET(req) {
    try {
        const { SerialPort } = await import('serialport'); // Dynamically import serialport
        console.log('Listing ports...');
        const ports = await SerialPort.list();
        return new Response(JSON.stringify(ports), { status: 200 });
    } catch (error) {
        console.error('Error listing ports:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to list serial ports' }),
            { status: 500 }
        );
    }
}