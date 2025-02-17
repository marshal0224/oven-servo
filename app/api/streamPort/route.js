import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

let port;

export async function GET(req) {
    const url = new URL(req.url);
    const portName = url.searchParams.get("port");

    if (!portName) {
        return new Response("Port is required", { status: 400 });
    }

    try {
        if (!port || !port.isOpen) {
            port = new SerialPort({ path: portName, baudRate: 9600 });
        }
        // Open the serial port
        const parser = port.pipe(new ReadlineParser()); // Parse lines of data

        // Initialize Server-Sent Events response
        return new Response(
        new ReadableStream({
            start(controller) {
            // Send initial SSE headers
            controller.enqueue(
                new TextEncoder().encode(
                "data: Connection established\n\n"
                )
            );
            // Listen for data and send each line to the client
            parser.on("data", (line) => {
                controller.enqueue(new TextEncoder().encode(`data: ${line}\n\n`));
            });
            // Handle port errors
            port.on("error", (err) => {
                console.error("Port error:", err);
                // controller.enqueue(
                // new TextEncoder().encode(`event: error\ndata: ${err.message}\n\n`)
                // );
                controller.close();
            });

            // Handle port closure
            port.on("close", () => {
                console.log("Port closed");
                // controller.enqueue(new TextEncoder().encode("event: close\ndata: Port closed\n\n"));
                // controller.close();
            });
            },
            cancel() {
            // Close the port if the client disconnects
            port.close();
            },
        }),
        {
            headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            },
        }
        );
    } catch (error) {
        console.error("Error opening port:", error);
        return new Response("Failed to open port", { status: 500 });
    }
}

export async function POST(req) {
    if (!port || !port.isOpen) {
        return new Response('Serial port not open', { status: 400 });
    }

    try {
        const { command } = await req.json();

        if (!command) {
            return new Response('Command is required', { status: 400 });
        }
        // Write the command to the serial port
        port.write(command + '\n', (err) => {
            if (err) {
                console.error('Error writing to port:', err);
                return new Response('Failed to send command', { status: 500 });
            }
        });

        return new Response('Command sent successfully', { status: 200 });
    } catch (error) {
        console.error('Error handling command:', error);
        return new Response('Failed to handle command', { status: 500 });
    }
}