"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { RoomTemplateId } from "@jean/shared";

import {
  type BillingWaitlistEntry,
  type BillingWaitlistResponse,
  type CreateProviderExchangeRateResponse,
  type CreateProviderCostResponse,
  type DevUser,
  type FetchProviderExchangeRateResponse,
  type JoinBillingWaitlistResponse,
  type Organization,
  type OrganizationMember,
  type OrganizationMembersResponse,
  type OrganizationUsage,
  type OrganizationUsageResponse,
  type OrganizationsResponse,
  type ProviderCostEntry,
  type ProviderCostConvertedSummary,
  type ProviderExchangeRate,
  type ProviderExchangeRatesResponse,
  type ProviderCostSummary,
  type ProviderCostsResponse,
  type Room,
  type RoomsResponse,
  type CreateOrganizationResponse,
  type CreateRoomResponse,
  type UpdateOrganizationMemberResponse,
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
  const [organizationUsage, setOrganizationUsage] = useState<OrganizationUsage | null>(null);
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMember[]>([]);
  const [billingWaitlistEntries, setBillingWaitlistEntries] = useState<BillingWaitlistEntry[]>([]);
  const [billingWaitlistNote, setBillingWaitlistNote] = useState("");
  const [providerCostEntries, setProviderCostEntries] = useState<ProviderCostEntry[]>([]);
  const [providerCostSummary, setProviderCostSummary] = useState<ProviderCostSummary[]>([]);
  const [providerCostConvertedSummary, setProviderCostConvertedSummary] = useState<ProviderCostConvertedSummary | null>(null);
  const [providerExchangeRates, setProviderExchangeRates] = useState<ProviderExchangeRate[]>([]);
  const [providerCostReportingCurrency, setProviderCostReportingCurrency] = useState("USD");
  const [providerCostProvider, setProviderCostProvider] = useState("");
  const [providerCostAmount, setProviderCostAmount] = useState("");
  const [providerCostCurrency, setProviderCostCurrency] = useState("USD");
  const [providerCostPeriodStart, setProviderCostPeriodStart] = useState("");
  const [providerCostPeriodEnd, setProviderCostPeriodEnd] = useState("");
  const [providerCostSourceUrl, setProviderCostSourceUrl] = useState("");
  const [providerCostNote, setProviderCostNote] = useState("");
  const [providerRateSourceCurrency, setProviderRateSourceCurrency] = useState("EUR");
  const [providerRateValue, setProviderRateValue] = useState("");
  const [providerRateEffectiveAt, setProviderRateEffectiveAt] = useState("");
  const [providerRateSourceUrl, setProviderRateSourceUrl] = useState("");
  const [providerRateNote, setProviderRateNote] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [roomTitle, setRoomTitle] = useState("");
  const [roomTemplateId, setRoomTemplateId] = useState<RoomTemplateId>("blank");
  const [notice, setNotice] = useState("");
  const [isLoadingOrganizations, setIsLoadingOrganizations] = useState(true);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [updatingMemberUserId, setUpdatingMemberUserId] = useState<string | null>(null);
  const [isLoadingBillingWaitlist, setIsLoadingBillingWaitlist] = useState(false);
  const [isJoiningBillingWaitlist, setIsJoiningBillingWaitlist] = useState(false);
  const [isLoadingProviderCosts, setIsLoadingProviderCosts] = useState(false);
  const [isCreatingProviderCost, setIsCreatingProviderCost] = useState(false);
  const [isCreatingProviderRate, setIsCreatingProviderRate] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const selectedOrganization = useMemo(
    () => organizations.find((organization) => organization.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId]
  );
  const billingWaitlistEntry = useMemo(
    () => billingWaitlistEntries.find((entry) => entry.email === user.email) ?? null,
    [billingWaitlistEntries, user.email]
  );
  const currentOrganizationMember = useMemo(
    () => organizationMembers.find((member) => member.userEmail === user.email) ?? null,
    [organizationMembers, user.email]
  );
  const canManageOrganizationMembers = currentOrganizationMember?.role === "OWNER";
  const selectedTemplate = roomTemplateOptions.find((template) => template.id === roomTemplateId) ?? roomTemplateOptions[0];
  const onboardingSteps = [
    {
      label: "Profile",
      detail: user.email || "Missing email",
      isDone: Boolean(user.email)
    },
    {
      label: "Organization",
      detail: selectedOrganization?.name ?? "Create or select",
      isDone: Boolean(selectedOrganization)
    },
    {
      label: "Template",
      detail: selectedTemplate?.label ?? "Blank",
      isDone: true
    },
    {
      label: "First room",
      detail: rooms.length > 0 ? `${rooms.length} ready` : "Create one",
      isDone: rooms.length > 0
    }
  ];

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
      setOrganizationUsage(null);
      setOrganizationMembers([]);
      setBillingWaitlistEntries([]);
      setBillingWaitlistNote("");
      resetProviderCosts();
      return;
    }

    void loadRooms(selectedOrganizationId, user);
    void loadOrganizationUsage(selectedOrganizationId, user);
    void loadOrganizationMembers(selectedOrganizationId, user);
    void loadBillingWaitlist(selectedOrganizationId, user);
    void loadProviderCosts(selectedOrganizationId, user);
    void loadProviderExchangeRates(selectedOrganizationId, user);
  }, [hasLoadedUser, selectedOrganizationId, providerCostReportingCurrency, user]);

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
      setOrganizationUsage(null);
      setBillingWaitlistEntries([]);
      setBillingWaitlistNote("");
      resetProviderCosts();
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

  async function loadOrganizationUsage(organizationId: string, activeUser: DevUser) {
    setIsLoadingUsage(true);

    try {
      const data = await workroomApi<OrganizationUsageResponse>(`/organizations/${organizationId}/usage`, {
        user: activeUser
      });

      setOrganizationUsage(data.usage);
    } catch (error) {
      setNotice(getErrorMessage(error));
      setOrganizationUsage(null);
    } finally {
      setIsLoadingUsage(false);
    }
  }

  async function loadOrganizationMembers(organizationId: string, activeUser: DevUser) {
    setIsLoadingMembers(true);

    try {
      const data = await workroomApi<OrganizationMembersResponse>(`/organizations/${organizationId}/members`, {
        user: activeUser
      });

      setOrganizationMembers(data.members);
    } catch (error) {
      setNotice(getErrorMessage(error));
      setOrganizationMembers([]);
    } finally {
      setIsLoadingMembers(false);
    }
  }

  async function loadBillingWaitlist(organizationId: string, activeUser: DevUser) {
    setIsLoadingBillingWaitlist(true);

    try {
      const data = await workroomApi<BillingWaitlistResponse>(`/organizations/${organizationId}/billing-waitlist`, {
        user: activeUser
      });
      const currentEntry = data.entries.find((entry) => entry.email === activeUser.email) ?? null;

      setBillingWaitlistEntries(data.entries);
      setBillingWaitlistNote(currentEntry?.note ?? "");
    } catch (error) {
      setNotice(getErrorMessage(error));
      setBillingWaitlistEntries([]);
      setBillingWaitlistNote("");
    } finally {
      setIsLoadingBillingWaitlist(false);
    }
  }

  async function loadProviderCosts(organizationId: string, activeUser: DevUser) {
    setIsLoadingProviderCosts(true);

    try {
      const reportingCurrency = normalizeCurrency(providerCostReportingCurrency);
      const query = reportingCurrency ? `?reportingCurrency=${encodeURIComponent(reportingCurrency)}` : "";
      const data = await workroomApi<ProviderCostsResponse>(`/organizations/${organizationId}/provider-costs${query}`, {
        user: activeUser
      });

      setProviderCostEntries(data.entries);
      setProviderCostSummary(data.summary);
      setProviderCostConvertedSummary(data.convertedSummary ?? null);
    } catch (error) {
      setNotice(getErrorMessage(error));
      setProviderCostEntries([]);
      setProviderCostSummary([]);
      setProviderCostConvertedSummary(null);
    } finally {
      setIsLoadingProviderCosts(false);
    }
  }

  async function loadProviderExchangeRates(organizationId: string, activeUser: DevUser) {
    try {
      const data = await workroomApi<ProviderExchangeRatesResponse>(`/organizations/${organizationId}/provider-exchange-rates`, {
        user: activeUser
      });

      setProviderExchangeRates(data.rates);
    } catch (error) {
      setNotice(getErrorMessage(error));
      setProviderExchangeRates([]);
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
    setOrganizationUsage(null);
    setOrganizationMembers([]);
    setBillingWaitlistEntries([]);
    setBillingWaitlistNote("");
    resetProviderCosts();
    setNotice("");
    setUser(nextUser);
  }

  function resetProviderCosts() {
    setProviderCostEntries([]);
    setProviderCostSummary([]);
    setProviderCostConvertedSummary(null);
    setProviderExchangeRates([]);
    setProviderCostProvider("");
    setProviderCostAmount("");
    setProviderCostCurrency("USD");
    setProviderCostPeriodStart("");
    setProviderCostPeriodEnd("");
    setProviderCostSourceUrl("");
    setProviderCostNote("");
    setProviderRateSourceCurrency("EUR");
    setProviderRateValue("");
    setProviderRateEffectiveAt("");
    setProviderRateSourceUrl("");
    setProviderRateNote("");
  }

  async function joinBillingWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrganization) {
      setNotice("Select an organization first.");
      return;
    }

    setIsJoiningBillingWaitlist(true);
    setNotice("");

    try {
      const note = billingWaitlistNote.trim();
      const data = await workroomApi<JoinBillingWaitlistResponse>(
        `/organizations/${selectedOrganization.id}/billing-waitlist`,
        {
          method: "POST",
          body: note ? { note } : {},
          user
        }
      );

      setBillingWaitlistEntries((currentEntries) => {
        const nextEntries = currentEntries.filter((entry) => entry.id !== data.entry.id && entry.email !== data.entry.email);

        return [data.entry, ...nextEntries];
      });
      setBillingWaitlistNote(data.entry.note ?? "");
      setNotice("Billing waitlist updated.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setIsJoiningBillingWaitlist(false);
    }
  }

  async function createProviderCost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrganization) {
      setNotice("Select an organization first.");
      return;
    }

    const amount = Number.parseFloat(providerCostAmount.trim().replace(",", "."));

    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice("Cost amount must be greater than zero.");
      return;
    }

    if (!providerCostProvider.trim()) {
      setNotice("Provider is required.");
      return;
    }

    if (!providerCostPeriodStart || !providerCostPeriodEnd) {
      setNotice("Cost period is required.");
      return;
    }

    setIsCreatingProviderCost(true);
    setNotice("");

    try {
      await workroomApi<CreateProviderCostResponse>(`/organizations/${selectedOrganization.id}/provider-costs`, {
        method: "POST",
        body: {
          provider: providerCostProvider.trim(),
          amountCents: Math.round(amount * 100),
          currency: providerCostCurrency.trim().toUpperCase(),
          periodStart: `${providerCostPeriodStart}T00:00:00.000Z`,
          periodEnd: `${providerCostPeriodEnd}T23:59:59.999Z`,
          ...(providerCostSourceUrl.trim() ? { sourceUrl: providerCostSourceUrl.trim() } : {}),
          ...(providerCostNote.trim() ? { note: providerCostNote.trim() } : {})
        },
        user
      });

      await loadProviderCosts(selectedOrganization.id, user);
      setProviderCostAmount("");
      setProviderCostSourceUrl("");
      setProviderCostNote("");
      setNotice("Provider cost added.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setIsCreatingProviderCost(false);
    }
  }

  async function createProviderExchangeRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrganization) {
      setNotice("Select an organization first.");
      return;
    }

    const sourceCurrency = normalizeCurrency(providerRateSourceCurrency);
    const reportingCurrency = normalizeCurrency(providerCostReportingCurrency);
    const rate = Number.parseFloat(providerRateValue.trim().replace(",", "."));

    if (!sourceCurrency || !reportingCurrency) {
      setNotice("Source and reporting currencies must be 3-letter codes.");
      return;
    }

    if (sourceCurrency === reportingCurrency) {
      setNotice("Source and reporting currencies must be different.");
      return;
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      setNotice("Exchange rate must be greater than zero.");
      return;
    }

    if (!providerRateEffectiveAt) {
      setNotice("Exchange rate date is required.");
      return;
    }

    setIsCreatingProviderRate(true);
    setNotice("");

    try {
      const data = await workroomApi<CreateProviderExchangeRateResponse>(
        `/organizations/${selectedOrganization.id}/provider-exchange-rates`,
        {
          method: "POST",
          body: {
            sourceCurrency,
            reportingCurrency,
            rateBps: Math.round(rate * 10_000),
            effectiveAt: `${providerRateEffectiveAt}T00:00:00.000Z`,
            ...(providerRateSourceUrl.trim() ? { sourceUrl: providerRateSourceUrl.trim() } : {}),
            ...(providerRateNote.trim() ? { note: providerRateNote.trim() } : {})
          },
          user
        }
      );

      setProviderExchangeRates((currentRates) => [data.rate, ...currentRates]);
      await loadProviderCosts(selectedOrganization.id, user);
      setProviderRateValue("");
      setProviderRateSourceUrl("");
      setProviderRateNote("");
      setNotice("Exchange rate added.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setIsCreatingProviderRate(false);
    }
  }

  async function fetchProviderExchangeRate() {
    if (!selectedOrganization) {
      setNotice("Select an organization first.");
      return;
    }

    const sourceCurrency = normalizeCurrency(providerRateSourceCurrency);
    const reportingCurrency = normalizeCurrency(providerCostReportingCurrency);

    if (!sourceCurrency || !reportingCurrency) {
      setNotice("Source and reporting currencies must be 3-letter codes.");
      return;
    }

    if (sourceCurrency === reportingCurrency) {
      setNotice("Source and reporting currencies must be different.");
      return;
    }

    if (!providerRateEffectiveAt) {
      setNotice("Exchange rate date is required.");
      return;
    }

    setIsCreatingProviderRate(true);
    setNotice("");

    try {
      const data = await workroomApi<FetchProviderExchangeRateResponse>(
        `/organizations/${selectedOrganization.id}/provider-exchange-rates/fetch`,
        {
          method: "POST",
          body: {
            sourceCurrency,
            reportingCurrency,
            effectiveAt: `${providerRateEffectiveAt}T00:00:00.000Z`
          },
          user
        }
      );

      setProviderExchangeRates((currentRates) => [data.rate, ...currentRates]);
      await loadProviderCosts(selectedOrganization.id, user);
      setProviderRateValue(formatRateBps(data.rate.rateBps));
      setProviderRateSourceUrl("");
      setProviderRateNote("");
      setNotice("Exchange rate fetched.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setIsCreatingProviderRate(false);
    }
  }

  async function updateOrganizationMemberRole(member: OrganizationMember, role: "ADMIN" | "MEMBER") {
    if (!selectedOrganization) {
      setNotice("Select an organization first.");
      return;
    }

    setUpdatingMemberUserId(member.userId);
    setNotice("");

    try {
      const data = await workroomApi<UpdateOrganizationMemberResponse>(
        `/organizations/${selectedOrganization.id}/members/${member.userId}`,
        {
          method: "PATCH",
          body: {
            role
          },
          user
        }
      );

      setOrganizationMembers((currentMembers) =>
        currentMembers.map((currentMember) => (currentMember.userId === data.member.userId ? data.member : currentMember))
      );
      setNotice("Organization member updated.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setUpdatingMemberUserId(null);
    }
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
        body: {
          title,
          templateId: roomTemplateId
        },
        user
      });

      window.location.assign(`/rooms/${data.room.id}`);
    } catch (error) {
      setNotice(getErrorMessage(error));
      setIsMutating(false);
    }
  }

  function selectRoomTemplate(templateId: RoomTemplateId) {
    const currentTemplate = roomTemplateOptions.find((template) => template.id === roomTemplateId);
    const nextTemplate = roomTemplateOptions.find((template) => template.id === templateId);

    setRoomTemplateId(templateId);

    if (!nextTemplate) {
      return;
    }

    setRoomTitle((currentTitle) => {
      const trimmedTitle = currentTitle.trim();

      if (!trimmedTitle || trimmedTitle === currentTemplate?.defaultTitle) {
        return nextTemplate.defaultTitle;
      }

      return currentTitle;
    });
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

      <section className="onboarding-panel" aria-label="Onboarding checklist">
        <div>
          <p className="eyebrow">Start</p>
          <h2>Alpha setup</h2>
        </div>
        <ol>
          {onboardingSteps.map((step) => (
            <li className={step.isDone ? "onboarding-step is-done" : "onboarding-step"} key={step.label}>
              <span>{step.isDone ? "Done" : "Next"}</span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </li>
          ))}
        </ol>
      </section>

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
            <fieldset className="template-picker" disabled={!selectedOrganization}>
              <legend>Template</legend>
              <div>
                {roomTemplateOptions.map((template) => (
                  <button
                    className={template.id === roomTemplateId ? "template-option is-selected" : "template-option"}
                    key={template.id}
                    onClick={() => selectRoomTemplate(template.id)}
                    type="button"
                  >
                    <strong>{template.label}</strong>
                    <span>{template.description}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </form>

          <UsageMetricsPanel isLoading={isLoadingUsage} usage={organizationUsage} />
          <OrganizationMembersPanel
            canManage={canManageOrganizationMembers}
            currentUserEmail={user.email}
            isLoading={isLoadingMembers}
            members={organizationMembers}
            onRoleChange={updateOrganizationMemberRole}
            updatingUserId={updatingMemberUserId}
          />
          <ProviderCostsPanel
            amount={providerCostAmount}
            convertedSummary={providerCostConvertedSummary}
            currency={providerCostCurrency}
            entries={providerCostEntries}
            exchangeRates={providerExchangeRates}
            isCostDisabled={!selectedOrganization || isCreatingProviderCost}
            isRateDisabled={!selectedOrganization || isCreatingProviderRate}
            isLoading={isLoadingProviderCosts}
            note={providerCostNote}
            onAmountChange={setProviderCostAmount}
            onCurrencyChange={setProviderCostCurrency}
            onNoteChange={setProviderCostNote}
            onPeriodEndChange={setProviderCostPeriodEnd}
            onPeriodStartChange={setProviderCostPeriodStart}
            onProviderChange={setProviderCostProvider}
            onRateEffectiveAtChange={setProviderRateEffectiveAt}
            onRateFetch={fetchProviderExchangeRate}
            onRateNoteChange={setProviderRateNote}
            onRateSourceCurrencyChange={setProviderRateSourceCurrency}
            onRateSourceUrlChange={setProviderRateSourceUrl}
            onRateSubmit={createProviderExchangeRate}
            onRateValueChange={setProviderRateValue}
            onReportingCurrencyChange={setProviderCostReportingCurrency}
            onSourceUrlChange={setProviderCostSourceUrl}
            onSubmit={createProviderCost}
            periodEnd={providerCostPeriodEnd}
            periodStart={providerCostPeriodStart}
            provider={providerCostProvider}
            rateEffectiveAt={providerRateEffectiveAt}
            rateNote={providerRateNote}
            rateSourceCurrency={providerRateSourceCurrency}
            rateSourceUrl={providerRateSourceUrl}
            rateValue={providerRateValue}
            reportingCurrency={providerCostReportingCurrency}
            sourceUrl={providerCostSourceUrl}
            summary={providerCostSummary}
          />
          <BillingWaitlistPanel
            count={billingWaitlistEntries.length}
            entry={billingWaitlistEntry}
            isDisabled={!selectedOrganization || isJoiningBillingWaitlist}
            isLoading={isLoadingBillingWaitlist}
            note={billingWaitlistNote}
            onNoteChange={setBillingWaitlistNote}
            onSubmit={joinBillingWaitlist}
          />

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

function UsageMetricsPanel({ isLoading, usage }: { isLoading: boolean; usage: OrganizationUsage | null }) {
  if (!usage && !isLoading) {
    return null;
  }

  const metrics = usage
    ? [
        {
          label: "Rooms",
          value: usage.rooms.total,
          detail: `${usage.rooms.live} live`,
          limit: usage.limits.rooms
        },
        {
          label: "Tasks",
          value: usage.tasks.total,
          detail: `${usage.tasks.completed} done`,
          limit: usage.limits.tasks
        },
        {
          label: "Artifacts",
          value: usage.artifacts.total,
          detail: `${usage.artifacts.previews} previews`,
          limit: usage.limits.artifacts
        },
        {
          label: "Agents",
          value: usage.agents.total,
          detail: "registered",
          limit: usage.limits.agents
        },
        {
          label: "Approvals",
          value: usage.approvals.total,
          detail: `${usage.approvals.pending} pending`,
          limit: usage.limits.approvals
        },
        {
          label: "Tool calls",
          value: usage.toolCalls.total,
          detail: `${usage.toolCalls.blocked} blocked`,
          limit: usage.limits.toolCalls
        }
      ]
    : [];
  const providerMetrics = usage
    ? [
        {
          label: "LiveKit",
          value: formatUsageMinutes(usage.providerUsage.liveKitParticipantMinutes),
          detail: "participant min"
        },
        {
          label: "Deepgram STT",
          value: formatUsageMinutes(usage.providerUsage.deepgramSttMinutes),
          detail: "audio min"
        },
        {
          label: "E2B",
          value: formatUsageMinutes(usage.providerUsage.e2bSandboxMinutes),
          detail: "sandbox min"
        },
        {
          label: "Failures",
          value: `${usage.providerUsage.connectorFailures}`,
          detail: "connectors"
        }
      ]
    : [];

  return (
    <section className="usage-metrics-panel" aria-label="Organization usage">
      <div className="panel-heading">
        <h2>Usage</h2>
        <span>{isLoading ? "Loading" : "Alpha"}</span>
      </div>
      <div className="usage-count-metrics">
        {metrics.length > 0 ? (
          metrics.map((metric) => (
            <article className={metric.limit.isOverLimit ? "usage-metric is-over-limit" : "usage-metric"} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
              <small>{metric.limit.used}/{metric.limit.limit}</small>
            </article>
          ))
        ) : (
          <p className="empty-state">Usage loading.</p>
        )}
      </div>
      {providerMetrics.length > 0 ? (
        <div className="usage-provider-metrics">
          {providerMetrics.map((metric) => (
            <article className="usage-provider-metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function OrganizationMembersPanel({
  canManage,
  currentUserEmail,
  isLoading,
  members,
  onRoleChange,
  updatingUserId
}: {
  canManage: boolean;
  currentUserEmail: string;
  isLoading: boolean;
  members: OrganizationMember[];
  onRoleChange: (member: OrganizationMember, role: "ADMIN" | "MEMBER") => void;
  updatingUserId: string | null;
}) {
  return (
    <section className="organization-members-panel" aria-label="Organization members">
      <div className="panel-heading">
        <h2>Members</h2>
        <span>{isLoading ? "Loading" : `${members.length}`}</span>
      </div>
      <div className="organization-member-list">
        {members.length === 0 ? <p className="empty-state">Members loading.</p> : null}
        {members.map((member) => {
          const canEditRole = canManage && member.role !== "OWNER" && member.userEmail !== currentUserEmail;

          return (
            <article className="organization-member-row" key={member.id}>
              <div>
                <strong>{member.userName || member.userEmail}</strong>
                <small>{member.userEmail}</small>
              </div>
              {canEditRole ? (
                <select
                  disabled={updatingUserId === member.userId}
                  onChange={(event) => onRoleChange(member, event.target.value as "ADMIN" | "MEMBER")}
                  value={member.role}
                >
                  <option value="ADMIN">Admin</option>
                  <option value="MEMBER">Member</option>
                </select>
              ) : (
                <span>{member.role}</span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ProviderCostsPanel({
  amount,
  convertedSummary,
  currency,
  entries,
  exchangeRates,
  isCostDisabled,
  isRateDisabled,
  isLoading,
  note,
  onAmountChange,
  onCurrencyChange,
  onNoteChange,
  onPeriodEndChange,
  onPeriodStartChange,
  onProviderChange,
  onRateEffectiveAtChange,
  onRateFetch,
  onRateNoteChange,
  onRateSourceCurrencyChange,
  onRateSourceUrlChange,
  onRateSubmit,
  onRateValueChange,
  onReportingCurrencyChange,
  onSourceUrlChange,
  onSubmit,
  periodEnd,
  periodStart,
  provider,
  rateEffectiveAt,
  rateNote,
  rateSourceCurrency,
  rateSourceUrl,
  rateValue,
  reportingCurrency,
  sourceUrl,
  summary
}: {
  amount: string;
  convertedSummary: ProviderCostConvertedSummary | null;
  currency: string;
  entries: ProviderCostEntry[];
  exchangeRates: ProviderExchangeRate[];
  isCostDisabled: boolean;
  isRateDisabled: boolean;
  isLoading: boolean;
  note: string;
  onAmountChange: (amount: string) => void;
  onCurrencyChange: (currency: string) => void;
  onNoteChange: (note: string) => void;
  onPeriodEndChange: (periodEnd: string) => void;
  onPeriodStartChange: (periodStart: string) => void;
  onProviderChange: (provider: string) => void;
  onRateEffectiveAtChange: (effectiveAt: string) => void;
  onRateFetch: () => void;
  onRateNoteChange: (note: string) => void;
  onRateSourceCurrencyChange: (currency: string) => void;
  onRateSourceUrlChange: (sourceUrl: string) => void;
  onRateSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRateValueChange: (rate: string) => void;
  onReportingCurrencyChange: (currency: string) => void;
  onSourceUrlChange: (sourceUrl: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  periodEnd: string;
  periodStart: string;
  provider: string;
  rateEffectiveAt: string;
  rateNote: string;
  rateSourceCurrency: string;
  rateSourceUrl: string;
  rateValue: string;
  reportingCurrency: string;
  sourceUrl: string;
  summary: ProviderCostSummary[];
}) {
  return (
    <section className="provider-costs-panel">
      <div className="panel-heading">
        <div>
          <h2>Provider costs</h2>
          <p>Manual real costs</p>
        </div>
        <span>{isLoading ? "Loading" : `${entries.length}`}</span>
      </div>
      <div className="provider-cost-summary">
        {summary.length > 0 ? (
          summary.map((item) => (
            <article className="provider-cost-total" key={item.currency}>
              <span>{item.currency}</span>
              <strong>{formatMoney(item.totalAmountCents, item.currency)}</strong>
              <small>{item.entryCount} entries</small>
            </article>
          ))
        ) : (
          <p className="empty-state">No provider costs yet.</p>
        )}
      </div>
      <div className="provider-cost-conversion">
        <label>
          <span>Reporting currency</span>
          <input maxLength={3} onChange={(event) => onReportingCurrencyChange(event.target.value)} value={reportingCurrency} />
        </label>
        <article className="provider-cost-total">
          <span>Converted total</span>
          <strong>
            {convertedSummary
              ? formatMoney(convertedSummary.totalAmountCents, convertedSummary.reportingCurrency)
              : "Waiting"}
          </strong>
          <small>
            {convertedSummary
              ? `${convertedSummary.convertedEntryCount} converted / ${convertedSummary.missingRateEntryCount} missing`
              : "Enter a 3-letter currency"}
          </small>
        </article>
        {convertedSummary && convertedSummary.missingCurrencies.length > 0 ? (
          <p className="provider-cost-warning">Missing rates: {convertedSummary.missingCurrencies.join(", ")}</p>
        ) : null}
      </div>
      <form className="provider-cost-form" onSubmit={onSubmit}>
        <label>
          <span>Provider</span>
          <input
            disabled={isCostDisabled}
            onChange={(event) => onProviderChange(event.target.value)}
            placeholder="OpenAI, LiveKit, E2B"
            value={provider}
          />
        </label>
        <label>
          <span>Amount</span>
          <input
            disabled={isCostDisabled}
            inputMode="decimal"
            onChange={(event) => onAmountChange(event.target.value)}
            placeholder="123.45"
            value={amount}
          />
        </label>
        <label>
          <span>Currency</span>
          <input
            disabled={isCostDisabled}
            maxLength={3}
            onChange={(event) => onCurrencyChange(event.target.value)}
            value={currency}
          />
        </label>
        <label>
          <span>Period start</span>
          <input
            disabled={isCostDisabled}
            onChange={(event) => onPeriodStartChange(event.target.value)}
            type="date"
            value={periodStart}
          />
        </label>
        <label>
          <span>Period end</span>
          <input disabled={isCostDisabled} onChange={(event) => onPeriodEndChange(event.target.value)} type="date" value={periodEnd} />
        </label>
        <label className="provider-cost-wide">
          <span>Source URL</span>
          <input
            disabled={isCostDisabled}
            onChange={(event) => onSourceUrlChange(event.target.value)}
            placeholder="https://..."
            type="url"
            value={sourceUrl}
          />
        </label>
        <label className="provider-cost-wide">
          <span>Note</span>
          <textarea
            disabled={isCostDisabled}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Invoice period, usage export, manual reconciliation"
            rows={2}
            value={note}
          />
        </label>
        <button type="submit" disabled={isCostDisabled}>
          Add cost
        </button>
      </form>
      <form className="provider-cost-form" onSubmit={onRateSubmit}>
        <label>
          <span>Source currency</span>
          <input
            disabled={isRateDisabled}
            maxLength={3}
            onChange={(event) => onRateSourceCurrencyChange(event.target.value)}
            value={rateSourceCurrency}
          />
        </label>
        <label>
          <span>Rate to {normalizeCurrency(reportingCurrency) || "target"}</span>
          <input
            disabled={isRateDisabled}
            inputMode="decimal"
            onChange={(event) => onRateValueChange(event.target.value)}
            placeholder="1.1000"
            value={rateValue}
          />
        </label>
        <label>
          <span>Effective date</span>
          <input
            disabled={isRateDisabled}
            onChange={(event) => onRateEffectiveAtChange(event.target.value)}
            type="date"
            value={rateEffectiveAt}
          />
        </label>
        <label className="provider-cost-wide">
          <span>Rate source URL</span>
          <input
            disabled={isRateDisabled}
            onChange={(event) => onRateSourceUrlChange(event.target.value)}
            placeholder="https://..."
            type="url"
            value={rateSourceUrl}
          />
        </label>
        <label className="provider-cost-wide">
          <span>Rate note</span>
          <textarea
            disabled={isRateDisabled}
            onChange={(event) => onRateNoteChange(event.target.value)}
            placeholder="Invoice FX rate or finance export"
            rows={2}
            value={rateNote}
          />
        </label>
        <div className="provider-cost-actions">
          <button type="submit" disabled={isRateDisabled}>
            Add rate
          </button>
          <button type="button" disabled={isRateDisabled} onClick={onRateFetch}>
            Fetch ECB rate
          </button>
        </div>
      </form>
      {exchangeRates.length > 0 ? (
        <div className="provider-cost-list">
          {exchangeRates.slice(0, 3).map((rate) => (
            <article className="provider-cost-row" key={rate.id}>
              <div>
                <strong>
                  {rate.sourceCurrency} to {rate.reportingCurrency}
                </strong>
                <small>{formatShortDate(rate.effectiveAt)}</small>
              </div>
              <span>{formatRateBps(rate.rateBps)}</span>
            </article>
          ))}
        </div>
      ) : null}
      {entries.length > 0 ? (
        <div className="provider-cost-list">
          {entries.slice(0, 3).map((entry) => (
            <article className="provider-cost-row" key={entry.id}>
              <div>
                <strong>{entry.provider}</strong>
                <small>
                  {formatShortDate(entry.periodStart)} - {formatShortDate(entry.periodEnd)}
                </small>
              </div>
              <span>{formatMoney(entry.amountCents, entry.currency)}</span>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BillingWaitlistPanel({
  count,
  entry,
  isDisabled,
  isLoading,
  note,
  onNoteChange,
  onSubmit
}: {
  count: number;
  entry: BillingWaitlistEntry | null;
  isDisabled: boolean;
  isLoading: boolean;
  note: string;
  onNoteChange: (note: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="billing-waitlist-panel">
      <div className="panel-heading">
        <div>
          <h2>Billing waitlist</h2>
          <p>{entry ? "Registered" : "Manual billing"}</p>
        </div>
        <span>{isLoading ? "Loading" : `${count}`}</span>
      </div>
      <form onSubmit={onSubmit}>
        <label>
          <span>Note</span>
          <textarea
            disabled={isDisabled}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Invoice, annual plan, procurement"
            rows={3}
            value={note}
          />
        </label>
        <button type="submit" disabled={isDisabled}>
          {entry ? "Update waitlist" : "Join waitlist"}
        </button>
      </form>
    </section>
  );
}

function formatMoney(amountCents: number, currency: string): string {
  return `${currency} ${(amountCents / 100).toFixed(2)}`;
}

function formatUsageMinutes(minutes: number): string {
  return Number.isInteger(minutes) ? `${minutes}` : minutes.toFixed(2);
}

function formatRateBps(rateBps: number): string {
  return (rateBps / 10_000).toFixed(4);
}

function formatShortDate(value: string): string {
  return value.slice(0, 10);
}

function normalizeCurrency(value: string): string | null {
  const currency = value.trim().toUpperCase();

  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

const roomTemplateOptions: Array<{
  id: RoomTemplateId;
  label: string;
  description: string;
  defaultTitle: string;
}> = [
  {
    id: "blank",
    label: "Blank",
    description: "Empty room",
    defaultTitle: ""
  },
  {
    id: "product_jam",
    label: "Product Jam",
    description: "Decisions and next steps",
    defaultTitle: "Product jam"
  },
  {
    id: "research_call",
    label: "Research Call",
    description: "Questions and synthesis",
    defaultTitle: "Research call"
  },
  {
    id: "prototype_session",
    label: "Prototype Session",
    description: "Flow and acceptance criteria",
    defaultTitle: "Prototype session"
  }
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed.";
}
