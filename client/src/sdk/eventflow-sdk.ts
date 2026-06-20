/**
 * EventFlow Client-Side Tracking SDK
 */
export class EventFlowSDK {
  private apiKey: string = "";
  private host: string = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8080"; // Gateway URL
  private userId: string = "";

  constructor() {
    if (typeof window !== "undefined") {
      // Get or create persistent anonymous user ID
      let storedId = localStorage.getItem("ef_user_id");
      if (!storedId) {
        storedId = "usr_" + Math.random().toString(36).substring(2, 15);
        localStorage.setItem("ef_user_id", storedId);
      }
      this.userId = storedId;
    }
  }

  public init(apiKey: string, host?: string) {
    this.apiKey = apiKey;
    if (host) {
      this.host = host;
    }
  }

  public identify(userId: string) {
    this.userId = userId;
    if (typeof window !== "undefined") {
      localStorage.setItem("ef_user_id", userId);
    }
  }

  public async track(eventName: string, properties: Record<string, any> = {}) {
    if (!this.apiKey) {
      console.warn("EventFlow SDK: Cannot track event. SDK is not initialized.");
      return;
    }

    const eventId = this.generateUUID();
    const timestamp = new Date().toISOString();

    // Auto-capture properties
    const enrichedProperties = {
      ...properties,
      userAgent: typeof window !== "undefined" ? navigator.userAgent : "NodeJS",
      screenResolution: typeof window !== "undefined" ? `${window.screen.width}x${window.screen.height}` : "Unknown",
      language: typeof window !== "undefined" ? navigator.language : "Unknown",
      referrer: typeof window !== "undefined" ? document.referrer : ""
    };

    const payload = {
      eventId,
      userId: this.userId,
      eventName,
      properties: enrichedProperties,
      timestamp
    };

    try {
      const response = await fetch(`${this.host}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Failed to send event: Status ${response.status}`);
      }
    } catch (error) {
      console.error("EventFlow SDK: Tracking error", error);
    }
  }

  private generateUUID(): string {
    if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c: any) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
    );
  }
}

export const eventflow = new EventFlowSDK();
