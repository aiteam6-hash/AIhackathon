"use client";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import type { Applicant } from "@/types";
import { CURRENCIES, DEGREES } from "@/lib/ai/shared";
import { Field } from "@/components/ui/field";
import { TagInput } from "./tag-input";

const num = (msg: string, min = 0, max = 100000000) => z.number({ error: msg }).min(min, msg).max(max, msg);

const schema = z.object({
  name: z.string().min(2, "Enter your full name."),
  email: z.string().email("Enter a valid email."),
  headline: z.string().min(2, "Add a short headline, such as your current job title."),
  location: z.string().min(2, "Enter the city you live in."),
  skills: z.array(z.string()).min(1, "Add at least one skill."),
  experienceYears: num("Enter years of experience between 0 and 50.", 0, 50),
  degree: z.enum(["None", "Diploma", "Bachelor's", "Master's", "PhD"]),
  field: z.string(),
  institution: z.string(),
  summary: z.string().min(20, "Write a sentence or two (at least 20 characters)."),
  expectedSalary: num("Enter your expected yearly salary.", 1),
  salaryCurrency: z.enum(["INR", "USD", "GBP", "EUR"]),
  noticeDays: num("Enter notice period in days (0 to 180).", 0, 180),
  openToRelocate: z.boolean(),
  work: z.array(z.object({
    title: z.string().min(1, "Enter a job title."),
    employer: z.string().min(1, "Enter an employer."),
    startYear: num("Enter a year.", 1980, 2026),
    endYear: z.number().nullable(),
  })),
});
type Values = z.infer<typeof schema>;

interface Props {
  initial: Applicant;
  submitLabel: string;
  onSave: (a: Applicant) => Promise<void>;
}

export function ProfileForm({ initial, submitLabel, onSave }: Props) {
  const { register, control, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial.name, email: initial.email, headline: initial.headline, location: initial.location,
      skills: initial.skills, experienceYears: initial.experienceYears, degree: initial.education.degree,
      field: initial.education.field, institution: initial.education.institution, summary: initial.summary,
      expectedSalary: initial.expectedSalary, salaryCurrency: initial.salaryCurrency, noticeDays: initial.noticeDays,
      openToRelocate: initial.openToRelocate, work: initial.work,
    },
  });
  const work = useFieldArray({ control, name: "work" });

  const submit = handleSubmit(async (v) => {
    await onSave({
      ...initial, name: v.name, email: v.email, headline: v.headline, location: v.location, skills: v.skills,
      experienceYears: v.experienceYears, education: { degree: v.degree, field: v.field, institution: v.institution },
      summary: v.summary, expectedSalary: v.expectedSalary, salaryCurrency: v.salaryCurrency, noticeDays: v.noticeDays,
      openToRelocate: v.openToRelocate, work: v.work,
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-10">
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="eyebrow mb-4">About you</legend>
        <Field label="Full name" error={errors.name} required>{(p) => <input className="input" {...p} {...register("name")} />}</Field>
        <Field label="Email" error={errors.email} required>{(p) => <input className="input" type="email" {...p} {...register("email")} />}</Field>
        <Field label="Headline" error={errors.headline} required hint="Usually your current job title.">{(p) => <input className="input" {...p} {...register("headline")} />}</Field>
        <Field label="City" error={errors.location} required>{(p) => <input className="input" {...p} {...register("location")} />}</Field>
        <div className="sm:col-span-2">
          <Field label="Summary" error={errors.summary} required>{(p) => <textarea className="input" {...p} {...register("summary")} />}</Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="eyebrow mb-4">Skills and experience</legend>
        <div className="sm:col-span-2">
          <Field label="Skills" error={errors.skills?.message} required>
            {(p) => <Controller control={control} name="skills" render={({ field }) => <TagInput id={p.id} value={field.value} onChange={field.onChange} aria-invalid={p["aria-invalid"]} aria-describedby={p["aria-describedby"]} />} />}
          </Field>
        </div>
        <Field label="Years of experience" error={errors.experienceYears} required>{(p) => <input className="input" type="number" step="0.5" {...p} {...register("experienceYears", { valueAsNumber: true })} />}</Field>
        <span />
        <Field label="Highest qualification">{(p) => <select className="input" {...p} {...register("degree")}>{DEGREES.map((d) => <option key={d}>{d}</option>)}</select>}</Field>
        <Field label="Field of study">{(p) => <input className="input" {...p} {...register("field")} />}</Field>
        <Field label="Institution">{(p) => <input className="input" {...p} {...register("institution")} />}</Field>
      </fieldset>

      <fieldset>
        <legend className="eyebrow mb-4">Work history</legend>
        <div className="space-y-4">
          {work.fields.map((f, i) => (
            <div key={f.id} className="grid gap-3 sm:grid-cols-[1.4fr_1.4fr_6rem_6rem_auto] items-end border-t border-rule pt-4">
              <Field label="Title" error={errors.work?.[i]?.title}>{(p) => <input className="input" {...p} {...register(`work.${i}.title`)} />}</Field>
              <Field label="Employer" error={errors.work?.[i]?.employer}>{(p) => <input className="input" {...p} {...register(`work.${i}.employer`)} />}</Field>
              <Field label="From" error={errors.work?.[i]?.startYear}>{(p) => <input className="input" type="number" {...p} {...register(`work.${i}.startYear`, { valueAsNumber: true })} />}</Field>
              <Field label="To" hint="Blank = current">{(p) => <input className="input" type="number" {...p} {...register(`work.${i}.endYear`, { setValueAs: (v) => (v === "" || v === null || Number.isNaN(Number(v)) ? null : Number(v)) })} />}</Field>
              <button type="button" className="btn btn-text btn-sm" aria-label={`Remove role ${i + 1}`} onClick={() => work.remove(i)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-sm mt-4" onClick={() => work.append({ title: "", employer: "", startYear: 2024, endYear: null })}><Plus size={14} aria-hidden /> Add a role</button>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="eyebrow mb-4">Pay and availability</legend>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Field label="Expected yearly salary" error={errors.expectedSalary} required>{(p) => <input className="input" type="number" {...p} {...register("expectedSalary", { valueAsNumber: true })} />}</Field>
          <Field label="Currency">{(p) => <select className="input" {...p} {...register("salaryCurrency")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
        </div>
        <Field label="Notice period (days)" error={errors.noticeDays} required>{(p) => <input className="input" type="number" {...p} {...register("noticeDays", { valueAsNumber: true })} />}</Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" {...register("openToRelocate")} /> I am open to relocating for the right role</label>
      </fieldset>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary btn-lg" disabled={isSubmitting}>{isSubmitting ? "Saving…" : submitLabel}</button>
        {isDirty && !isSubmitting && <span className="text-sm text-muted">You have unsaved changes.</span>}
      </div>
    </form>
  );
}
