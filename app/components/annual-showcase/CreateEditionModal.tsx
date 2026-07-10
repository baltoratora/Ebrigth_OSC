"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EditionSummary } from "./EditionContext";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (edition: EditionSummary) => void;
}

const LEAD_FIELDS = [
  { key: "ocLead",           label: "Organizing Committee" },
  { key: "procurementLead",  label: "Procurement" },
  { key: "sponsorshipLead",  label: "Sponsorship & VVIP" },
  { key: "mediaLead",        label: "Media & Publicity" },
  { key: "showcaseLead",     label: "Showcase & Production" },
  { key: "youthpreneurLead", label: "Youthpreneur" },
  { key: "ceoLead",          label: "CEO Unit" },
] as const;

const EMPTY_FORM = {
  name: "", theme: "", startDate: "", endDate: "", venueName: "",
  venueAddress: "", participantTarget: "500", profitabilityTarget: "30",
  registrationDeadline: "", testRunDate: "", currency: "MYR",
  ocLead: "", procurementLead: "", sponsorshipLead: "",
  mediaLead: "", showcaseLead: "", youthpreneurLead: "", ceoLead: "",
};

export default function CreateEditionModal({ open, onClose, onCreated }: Props) {
  const [form, setForm]       = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleClose() {
    setForm(EMPTY_FORM);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.theme.trim()) {
      toast.error("Edition Name and Theme are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/annual-showcase/editions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:  form.name.trim(),
          theme: form.theme.trim(),
          startDate:            form.startDate            || undefined,
          endDate:              form.endDate              || undefined,
          venueName:            form.venueName            || undefined,
          venueAddress:         form.venueAddress         || undefined,
          participantTarget:    form.participantTarget    ? Number(form.participantTarget)    : 0,
          profitabilityTarget:  form.profitabilityTarget  ? Number(form.profitabilityTarget)  : 0,
          registrationDeadline: form.registrationDeadline || undefined,
          testRunDate:          form.testRunDate          || undefined,
          currency:             form.currency             || "MYR",
          departmentLeads: {
            oc:           form.ocLead           || undefined,
            procurement:  form.procurementLead  || undefined,
            sponsorship:  form.sponsorshipLead  || undefined,
            media:        form.mediaLead        || undefined,
            showcase:     form.showcaseLead     || undefined,
            youthpreneur: form.youthpreneurLead || undefined,
            ceo:          form.ceoLead          || undefined,
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "Failed to create");
      }
      const created = await res.json() as EditionSummary;
      toast.success("Edition created!");
      setForm(EMPTY_FORM);
      onCreated(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create edition");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Edition</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Edition Name *</label>
              <Input placeholder="e.g. Annual Showcase 2026" value={form.name} onChange={set("name")} required />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Theme *</label>
              <Input placeholder="e.g. Beyond Boundaries" value={form.theme} onChange={set("theme")} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <Input type="date" value={form.startDate} onChange={set("startDate")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <Input type="date" value={form.endDate} onChange={set("endDate")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name</label>
              <Input placeholder="e.g. KLCC Convention Centre" value={form.venueName} onChange={set("venueName")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Venue Address</label>
              <Input placeholder="Full address" value={form.venueAddress} onChange={set("venueAddress")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Participant Target</label>
              <Input type="number" min={0} placeholder="500" value={form.participantTarget} onChange={set("participantTarget")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Profitability Target (%)</label>
              <Input type="number" min={0} max={100} placeholder="30" value={form.profitabilityTarget} onChange={set("profitabilityTarget")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Registration Deadline</label>
              <Input type="date" value={form.registrationDeadline} onChange={set("registrationDeadline")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Test Run Date</label>
              <Input type="date" value={form.testRunDate} onChange={set("testRunDate")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <Input placeholder="MYR" value={form.currency} onChange={set("currency")} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Department Leads</p>
            <div className="space-y-2">
              {LEAD_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-48 shrink-0 text-sm text-gray-600">{label}</span>
                  <Input
                    className="flex-1"
                    placeholder="Full name"
                    value={(form as Record<string, string>)[key]}
                    onChange={set(key)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1" disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1 bg-orange-600 hover:bg-orange-700">
              {submitting ? "Creating..." : "Create Edition"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
