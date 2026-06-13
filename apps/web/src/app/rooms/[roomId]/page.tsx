import { RoomShell } from "@/components/room-shell";

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;

  return <RoomShell roomId={roomId} />;
}
