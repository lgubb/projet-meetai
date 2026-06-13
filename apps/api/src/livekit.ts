import { AccessToken } from "livekit-server-sdk";

export type LiveKitTokenRequest = {
  roomId: string;
  userId: string;
  userName: string | null;
};

export type LiveKitTokenIssuer = {
  serverUrl: string;
  issueRoomToken(request: LiveKitTokenRequest): Promise<string>;
};

type LiveKitConfig = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

export function createLiveKitTokenIssuer(env: NodeJS.ProcessEnv = process.env): LiveKitTokenIssuer {
  const config = readLiveKitConfig(env);

  return {
    serverUrl: config.url,
    async issueRoomToken(request) {
      const token = new AccessToken(config.apiKey, config.apiSecret, {
        identity: request.userId,
        name: request.userName ?? request.userId,
        ttl: "6h"
      });

      token.addGrant({
        room: request.roomId,
        roomJoin: true,
        canPublish: true,
        canPublishData: true,
        canSubscribe: true
      });

      return token.toJwt();
    }
  };
}

function readLiveKitConfig(env: NodeJS.ProcessEnv): LiveKitConfig {
  return {
    url: readRequiredEnv(env, "LIVEKIT_URL"),
    apiKey: readRequiredEnv(env, "LIVEKIT_API_KEY"),
    apiSecret: readRequiredEnv(env, "LIVEKIT_API_SECRET")
  };
}

function readRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}
