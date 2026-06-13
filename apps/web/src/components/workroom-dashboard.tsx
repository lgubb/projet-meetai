"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  type DevUser,
  type Organization,
  type OrganizationsResponse,
  type Room,
  type RoomsResponse,
  type CreateOrganizationResponse,
  type CreateRoomResponse,
  workroomApi
} from "@/lib/workroom-api";
import { defaultDevUser, readSavedDevUser, saveDevUser } from "@/lib/dev-user";

export function WorkroomDashboard() {
  const [user, setUser] = useState<DevUser>(defaultDevUser);
  const [draftUser, setDraftUser] = useState<DevUser>(defaultDevUser);
  const [hasLoadedUser, setHasLoadedUser] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [organizationName, setOrganizationName] = useState("");
  const [roomTitle, setRoomTitle] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoadingOrganizations, setIsLoadingOrganizations] = useState(true);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const selectedOrganization = useMemo(
    () => organizations.find((organization) => organization.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId]
  );

  useEffect(() => {
    const savedUser = readSavedDevUser();

    setUser(savedUser);
    setDraftUser(savedUser);
    setHasLoadedUser(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedUser) {
      return;
    }

    void loadOrganizations(user);
  }, [hasLoadedUser, user]);

  useEffect(() => {
    if (!hasLoadedUser) {
      return;
    }

    if (!selectedOrganizationId) {
      setRooms([]);
      return;
    }

    void loadRooms(selectedOrganizationId, user);
  }, [hasLoadedUser, selectedOrganizationId, user]);

  async function loadOrganizations(activeUser: DevUser) {
    setIsLoadingOrganizations(true);
    setNotice("");

    try {
      const data = await workroomApi<OrganizationsResponse>("/organizations", {
        user: activeUser
      });

      setOrganizations(data.organizations);
      setSelectedOrganizationId((currentId) => {
        if (data.organizations.some((organization) => organization.id === currentId)) {
          return currentId;
        }

        return data.organizations[0]?.id ?? "";
      });
    } catch (error) {
      setNotice(getErrorMessage(error));
      setOrganizations([]);
      setSelectedOrganizationId("");
    } finally {
      setIsLoadingOrganizations(false);
    }
  }

  async function loadRooms(organizationId: string, activeUser: DevUser) {
    setIsLoadingRooms(true);
    setNotice("");

    try {
      const data = await workroomApi<RoomsResponse>(`/organizations/${organizationId}/rooms`, {
        user: activeUser
      });

      setRooms(data.rooms);
    } catch (error) {
      setNotice(getErrorMessage(error));
      setRooms([]);
    } finally {
      setIsLoadingRooms(false);
    }
  }

  function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextUser = {
      email: draftUser.email.trim(),
      name: draftUser.name.trim()
    };

    if (!nextUser.email) {
      setNotice("Email is required.");
      return;
    }

    saveDevUser(nextUser);
    setOrganizations([]);
    setSelectedOrganizationId("");
    setRooms([]);
    setNotice("");
    setUser(nextUser);
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = organizationName.trim();

    if (!name) {
      setNotice("Organization name is required.");
      return;
    }

    setIsMutating(true);
    setNotice("");

    try {
      const data = await workroomApi<CreateOrganizationResponse>("/organizations", {
        method: "POST",
        body: { name },
        user
      });

      setOrganizationName("");
      await loadOrganizations(user);
      setSelectedOrganizationId(data.organization.id);
      setNotice("Organization created.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrganization) {
      setNotice("Select an organization first.");
      return;
    }

    const title = roomTitle.trim();

    if (!title) {
      setNotice("Room title is required.");
      return;
    }

    setIsMutating(true);
    setNotice("");

    try {
      const data = await workroomApi<CreateRoomResponse>(`/organizations/${selectedOrganization.id}/rooms`, {
        method: "POST",
        body: { title },
        user
      });

      window.location.assign(`/rooms/${data.room.id}`);
    } catch (error) {
      setNotice(getErrorMessage(error));
      setIsMutating(false);
    }
  }

  async function copyRoomLink(roomId: string) {
    const url = new URL(`/rooms/${roomId}`, window.location.origin).toString();

    await navigator.clipboard.writeText(url);
    setNotice("Room link copied.");
  }

  return (
    <main className="page-shell">
      <header className="app-topbar">
        <div>
          <p className="eyebrow">Jean Workroom</p>
          <h1>Rooms</h1>
        </div>
        <form className="identity-form" onSubmit={saveUser}>
          <label>
            <span>Email</span>
            <input
              value={draftUser.email}
              onChange={(event) => setDraftUser((current) => ({ ...current, email: event.target.value }))}
              type="email"
              autoComplete="email"
            />
          </label>
          <label>
            <span>Name</span>
            <input
              value={draftUser.name}
              onChange={(event) => setDraftUser((current) => ({ ...current, name: event.target.value }))}
              autoComplete="name"
            />
          </label>
          <button type="submit">Use user</button>
        </form>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}

      <section className="dashboard-grid">
        <aside className="panel organizations-panel">
          <div className="panel-heading">
            <h2>Organizations</h2>
            <span>{isLoadingOrganizations ? "Loading" : `${organizations.length}`}</span>
          </div>

          <form className="stacked-form" onSubmit={createOrganization}>
            <label>
              <span>Name</span>
              <input
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                placeholder="Acme Product"
              />
            </label>
            <button type="submit" disabled={isMutating}>
              Create organization
            </button>
          </form>

          <div className="list-block">
            {organizations.length === 0 && !isLoadingOrganizations ? (
              <p className="empty-state">No organizations.</p>
            ) : null}
            {organizations.map((organization) => (
              <button
                className={organization.id === selectedOrganizationId ? "list-row is-selected" : "list-row"}
                key={organization.id}
                onClick={() => setSelectedOrganizationId(organization.id)}
                type="button"
              >
                <span>{organization.name}</span>
                <small>{organization.id}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel rooms-panel">
          <div className="panel-heading">
            <div>
              <h2>{selectedOrganization?.name ?? "Rooms"}</h2>
              <p>{selectedOrganization ? selectedOrganization.id : "Select an organization."}</p>
            </div>
            <span>{isLoadingRooms ? "Loading" : `${rooms.length}`}</span>
          </div>

          <form className="room-create-form" onSubmit={createRoom}>
            <label>
              <span>Room title</span>
              <input
                value={roomTitle}
                onChange={(event) => setRoomTitle(event.target.value)}
                placeholder="Product jam"
                disabled={!selectedOrganization}
              />
            </label>
            <button type="submit" disabled={!selectedOrganization || isMutating}>
              Create room
            </button>
          </form>

          <div className="room-list">
            {rooms.length === 0 && selectedOrganization && !isLoadingRooms ? <p className="empty-state">No rooms.</p> : null}
            {rooms.map((room) => (
              <article className="room-row" key={room.id}>
                <div>
                  <h3>{room.title}</h3>
                  <p>{room.status}</p>
                </div>
                <div className="row-actions">
                  <button type="button" onClick={() => copyRoomLink(room.id)}>
                    Copy link
                  </button>
                  <a href={`/rooms/${room.id}`}>Open</a>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed.";
}
