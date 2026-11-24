import type { Category, Currency, Degree, EmploymentType, Level, Stage, WorkMode } from "@/types";

/** The database stores enums in snake_case or lower case; the UI shows them in display form. */
const DEGREE_TO_UI: Record<string, Degree> = { none: "None", diploma: "Diploma", bachelors: "Bachelor's", masters: "Master's", phd: "PhD" };
const DEGREE_TO_DB: Record<Degree, string> = { None: "none", Diploma: "diploma", "Bachelor's": "bachelors", "Master's": "masters", PhD: "phd" };
export const degreeUi = (v: string): Degree => DEGREE_TO_UI[v] ?? "None";
export const degreeDb = (v: Degree) => DEGREE_TO_DB[v] ?? "none";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const categoryUi = (v: string) => cap(v) as Category;
export const categoryDb = (v: Category) => v.toLowerCase();
export const modeUi = (v: string) => cap(v) as WorkMode;
export const modeDb = (v: WorkMode) => v.toLowerCase();
export const levelUi = (v: string) => cap(v) as Level;
export const levelDb = (v: Level) => v.toLowerCase();
export const stageUi = (v: string) => cap(v) as Stage;
export const stageDb = (v: Stage) => v.toLowerCase();
export const typeUi = (v: string) => cap(v).replace("_t", "-t") as EmploymentType;
export const typeDb = (v: EmploymentType) => v.toLowerCase().replace("-", "_");
export const currencyUi = (v: string) => v as Currency;
