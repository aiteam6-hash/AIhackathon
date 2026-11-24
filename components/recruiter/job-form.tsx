"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import type { Company, Job } from "@/types";
import { CATEGORIES, CURRENCIES, DEGREES } from "@/lib/ai/shared";
import { suggestCriteria } from "@/lib/ai/engine";
import { jobsService } from "@/lib/services/jobsService";
import { salaryRange, uid } from "@/lib/utils/format";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { TagInput } from "@/components/applicant/tag-input";

const money = (m: string) => z.number({ error: m }).min(0, m);
const schema = z.object({
  title: z.string().min(3, "Give the role a title of at least 3 characters."),
  companyId: z.string().min(1, "Choose a company."),
  department: z.string().min(2, "Enter a department."),
  category: z.enum(["Engineering", "Design", "Operations", "Sales", "Support", "Finance"]),
  level: z.enum(["Entry", "Mid", "Senior", "Lead"]),
  location: z.string().min(2, "Enter the city the role is based in."),
  workMode: z.enum(["Remote", "Hybrid", "Onsite"]),
  employmentType: z.enum(["Full-time", "Part-time", "Contract", "Internship"]),
  openings: z.number({ error: "Enter the number of openings." }).int().min(1, "At least 1 opening."),
  salaryMin: money("Enter the lowest salary."), salaryMax: money("Enter the highest salary."),
  currency: z.enum(["INR", "USD", "GBP", "EUR"]),
  description: z.string().min(40, "Describe the role in at least a couple of sentences (40 characters)."),
  responsibilities: z.array(z.object({ text: z.string() })),
  preferredSkills: z.array(z.string()),
  minExperience: z.number({ error: "Enter the minimum years of experience." }).min(0).max(40),
  requiredSkills: z.array(z.string()),
  degree: z.enum(["None", "Diploma", "Bachelor's", "Master's", "PhD"]),
  maxNoticeDays: z.number({ error: "Enter the longest notice period you accept." }).min(0).max(365),
  questions: z.array(z.object({ text: z.string() })),
  allowIneligible: z.boolean(),
}).refine((v) => v.salaryMax >= v.salaryMin, { path: ["salaryMax"], message: "The top of the range must be at least the bottom." });
type V = z.infer<typeof schema>;

interface Props { initial?: Job; companies: Company[]; userId: string }

export function JobForm({ initial, companies, userId }: Props) {
  const router = useRouter();
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const isLive = !!initial && initial.status !== "Draft";
  const { register, control, handleSubmit, getValues, trigger, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: initial ? {
      title: initial.title, companyId: initial.companyId, department: initial.department, category: initial.category, level: initial.level,
      location: initial.location, workMode: initial.workMode, employmentType: initial.employmentType, openings: initial.openings,
      salaryMin: initial.salaryMin, salaryMax: initial.salaryMax, currency: initial.currency, description: initial.description,
      responsibilities: initial.responsibilities.map((text) => ({ text })), preferredSkills: initial.preferredSkills,
      minExperience: initial.requirements.minExperience, requiredSkills: initial.requirements.requiredSkills, degree: initial.requirements.degree,
      maxNoticeDays: initial.requirements.maxNoticeDays, questions: initial.screeningQuestions.map((q) => ({ text: q.text })), allowIneligible: initial.allowIneligible,
    } : {
      title: "", companyId: companies[0]?.id ?? "", department: "", category: "Engineering", level: "Mid", location: "", workMode: "Hybrid",
      employmentType: "Full-time", openings: 1, salaryMin: 0, salaryMax: 0, currency: "INR", description: "",
      responsibilities: [{ text: "" }, { text: "" }], preferredSkills: [], minExperience: 2, requiredSkills: [], degree: "Bachelor's",
      maxNoticeDays: 60, questions: [{ text: "" }], allowIneligible: false,
    },
  });
  const resp = useFieldArray({ control, name: "responsibilities" });
  const qs = useFieldArray({ control, name: "questions" });

  function build(v: V, status: Job["status"]): Job {
    const id = initial?.id ?? uid("j");
    const job: Job = {
      id, companyId: v.companyId, recruiterId: initial?.recruiterId ?? userId, title: v.title.trim(), category: v.category, department: v.department,
      location: v.location, workMode: v.workMode, employmentType: v.employmentType, level: v.level, salaryMin: v.salaryMin, salaryMax: v.salaryMax,
      currency: v.currency, description: v.description, responsibilities: v.responsibilities.map((r) => r.text.trim()).filter(Boolean),
      preferredSkills: v.preferredSkills,
      requirements: { minExperience: v.minExperience, requiredSkills: v.requiredSkills, degree: v.degree, locations: v.workMode === "Remote" ? [] : [v.location], maxNoticeDays: v.maxNoticeDays },
      screeningQuestions: v.questions.map((q, i) => ({ id: initial?.screeningQuestions[i]?.id ?? uid("q"), text: q.text.trim() })).filter((q) => q.text),
      allowIneligible: v.allowIneligible, status, openings: v.openings,
      postedAt: initial && initial.status !== "Draft" ? initial.postedAt : new Date().toISOString(),
      criteria: initial?.criteria ?? [],
    };
    if (!job.criteria.length) job.criteria = suggestCriteria(job);
    return job;
  }

  async function persist(job: Job, message: string) {
    setSaving(true);
    try { await jobsService.saveJob(job); toast.success(message); router.push(job.status === "Draft" ? "/recruiter/jobs" : `/recruiter/jobs/${job.id}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save the role."); setSaving(false); }
  }

  const saveDraft = async () => { if (await trigger("title")) await persist(build(getValues(), "Draft"), "Draft saved."); };
  const publish = handleSubmit((v) => persist(build(v, isLive ? initial!.status : "Open"), isLive ? "Changes saved." : "Role published. Applicants can see it now."));
  const sel = (cls = "input") => cls;

  return (
    <form onSubmit={publish} noValidate className="space-y-12 max-w-4xl">
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="text-3xl mb-5">The role</legend>
        <div className="sm:col-span-2"><Field label="Job title" required error={errors.title}>{(p) => <input className="input" {...p} {...register("title")} />}</Field></div>
        <Field label="Company" required error={errors.companyId}>{(p) => <select className={sel()} {...p} {...register("companyId")}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
        <Field label="Department" required error={errors.department}>{(p) => <input className="input" {...p} {...register("department")} />}</Field>
        <Field label="Category">{(p) => <select className="input" {...p} {...register("category")}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
        <Field label="Seniority">{(p) => <select className="input" {...p} {...register("level")}>{["Entry", "Mid", "Senior", "Lead"].map((c) => <option key={c}>{c}</option>)}</select>}</Field>
        <Field label="City" required error={errors.location}>{(p) => <input className="input" {...p} {...register("location")} />}</Field>
        <Field label="Work mode">{(p) => <select className="input" {...p} {...register("workMode")}>{["Remote", "Hybrid", "Onsite"].map((c) => <option key={c}>{c}</option>)}</select>}</Field>
        <Field label="Employment type">{(p) => <select className="input" {...p} {...register("employmentType")}>{["Full-time", "Part-time", "Contract", "Internship"].map((c) => <option key={c}>{c}</option>)}</select>}</Field>
        <Field label="Openings" error={errors.openings}>{(p) => <input className="input" type="number" {...p} {...register("openings", { valueAsNumber: true })} />}</Field>
        <Field label="Yearly salary, from" required error={errors.salaryMin}>{(p) => <input className="input" type="number" {...p} {...register("salaryMin", { valueAsNumber: true })} />}</Field>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Field label="Yearly salary, to" required error={errors.salaryMax}>{(p) => <input className="input" type="number" {...p} {...register("salaryMax", { valueAsNumber: true })} />}</Field>
          <Field label="Currency">{(p) => <select className="input" {...p} {...register("currency")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
        </div>
        <div className="sm:col-span-2"><Field label="Description" required error={errors.description} hint="What the team does and what this person will own.">{(p) => <textarea className="input min-h-32" {...p} {...register("description")} />}</Field></div>
      </fieldset>

      <fieldset>
        <legend className="text-3xl mb-5">Responsibilities</legend>
        <div className="space-y-3">
          {resp.fields.map((f, i) => (
            <div key={f.id} className="flex gap-2 items-start">
              <input className="input" aria-label={`Responsibility ${i + 1}`} {...register(`responsibilities.${i}.text`)} />
              <button type="button" className="btn btn-text" aria-label={`Remove responsibility ${i + 1}`} onClick={() => resp.remove(i)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-sm mt-3" onClick={() => resp.append({ text: "" })}><Plus size={14} aria-hidden /> Add responsibility</button>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="text-3xl mb-1">Hard requirements</legend>
        <p className="sm:col-span-2 text-sm text-muted mb-3">Applicants who miss any of these are flagged as ineligible, and you can reject them all in one click.</p>
        <Field label="Minimum years of experience" required error={errors.minExperience}>{(p) => <input className="input" type="number" step="0.5" {...p} {...register("minExperience", { valueAsNumber: true })} />}</Field>
        <Field label="Degree">{(p) => <select className="input" {...p} {...register("degree")}>{DEGREES.map((d) => <option key={d}>{d}</option>)}</select>}</Field>
        <div className="sm:col-span-2"><Field label="Required skills" hint="Every one must be on the applicant's profile. Keep this list short.">{(p) => <Controller control={control} name="requiredSkills" render={({ field }) => <TagInput id={p.id} value={field.value} onChange={field.onChange} />} />}</Field></div>
        <Field label="Longest notice period (days)" required error={errors.maxNoticeDays} hint="Location is taken from the city above, unless the role is remote.">{(p) => <input className="input" type="number" {...p} {...register("maxNoticeDays", { valueAsNumber: true })} />}</Field>
        <div className="sm:col-span-2"><Field label="Preferred skills" hint="Not required, but they raise the match and skill scores.">{(p) => <Controller control={control} name="preferredSkills" render={({ field }) => <TagInput id={p.id} value={field.value} onChange={field.onChange} />} />}</Field></div>
        <label className="sm:col-span-2 flex items-start gap-2 text-sm border-t border-rule pt-4"><input type="checkbox" className="mt-0.5" {...register("allowIneligible")} /> <span><strong>Allow applicants who do not meet the requirements to apply anyway.</strong><br /><span className="text-muted">They will be marked as ineligible in your list, so you can still decide for yourself.</span></span></label>
      </fieldset>

      <fieldset>
        <legend className="text-3xl mb-5">Screening questions</legend>
        <div className="space-y-3">
          {qs.fields.map((f, i) => (
            <div key={f.id} className="flex gap-2 items-start">
              <input className="input" aria-label={`Question ${i + 1}`} placeholder="For example: Describe a project where you…" {...register(`questions.${i}.text`)} />
              <button type="button" className="btn btn-text" aria-label={`Remove question ${i + 1}`} onClick={() => qs.remove(i)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-sm mt-3" onClick={() => qs.append({ text: "" })}><Plus size={14} aria-hidden /> Add question</button>
      </fieldset>

      <div className="flex flex-wrap gap-3 border-t border-ink pt-6">
        {!isLive && <button type="button" className="btn" onClick={saveDraft} disabled={saving}>Save draft</button>}
        <button type="button" className="btn" onClick={async () => { if (await trigger()) setPreview(true); }}>Preview</button>
        <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : isLive ? "Save changes" : "Publish role"}</button>
      </div>

      <Modal open={preview} onClose={() => setPreview(false)} title="How applicants will see this" wide
        footer={<button type="button" className="btn" onClick={() => setPreview(false)}>Back to editing</button>}>
        {preview && (() => { const v = getValues(); return (
          <div className="space-y-4 text-sm">
            <div><h3 className="text-3xl">{v.title}</h3><p className="text-muted">{companies.find((c) => c.id === v.companyId)?.name} · {v.location} · {v.workMode} · {v.employmentType} · {v.level}</p><p className="num font-semibold">{salaryRange({ salaryMin: v.salaryMin, salaryMax: v.salaryMax, currency: v.currency })}</p></div>
            <p className="leading-relaxed">{v.description}</p>
            <ul className="list-disc pl-5">{v.responsibilities.filter((r) => r.text.trim()).map((r, i) => <li key={i}>{r.text}</li>)}</ul>
            <p><strong>Requires:</strong> {v.minExperience}+ years, {v.requiredSkills.join(", ") || "no specific skills"}, {v.degree === "None" ? "no degree" : v.degree}, notice up to {v.maxNoticeDays} days.</p>
            <p>{v.allowIneligible ? "Applicants who miss a requirement may apply anyway." : "Applicants who miss a requirement cannot apply."}</p>
          </div>); })()}
      </Modal>
    </form>
  );
}
