import { formSettingsSchema, themeSchema, type FormDefinition, type Question, type QuestionConfig, type QuestionType } from "./form";

/** Deterministic UUID (v4 layout) from a seed, so template definitions are stable. */
export function seededId(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let out = "";
  for (let round = 0; out.length < 32; round++) {
    for (let i = 0; i < seed.length; i++) {
      h1 = Math.imul(h1 ^ seed.charCodeAt(i), 16777619) >>> 0;
      h2 = Math.imul(h2 ^ (seed.charCodeAt(i) + round), 2246822519) >>> 0;
    }
    out += ((h1 ^ h2) >>> 0).toString(16).padStart(8, "0");
    h1 = (h1 + round + 1) >>> 0;
  }
  const s = out.slice(0, 32).split("");
  s[12] = "4";
  s[16] = "89ab"[parseInt(s[16], 16) % 4];
  const x = s.join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

type QSpec = [type: QuestionType, title: string, extra?: { required?: boolean; options?: string[]; config?: QuestionConfig; description?: string; showIf?: { q: number; op: "equals" | "contains"; value: string } }];

export interface TemplateSpec {
  slug: string;
  category: "Education" | "Research" | "Business" | "Organisations";
  title: string;
  summary: string;
  sections: { title: string; description?: string; questions: QSpec[] }[];
}

const likert5 = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
const satisfaction = ["Very dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very satisfied"];

export const TEMPLATE_SPECS: TemplateSpec[] = [
  // ---------------- Education ----------------
  {
    slug: "student-feedback",
    category: "Education",
    title: "Student feedback",
    summary: "Gather students' views on teaching, learning environment and support.",
    sections: [
      {
        title: "About you",
        questions: [
          ["dropdown", "Which level are you in?", { required: true, options: ["Year 1", "Year 2", "Year 3", "Year 4", "Postgraduate"] }],
          ["single_choice", "How often do you attend classes?", { required: true, options: ["Always", "Usually", "Sometimes", "Rarely"] }],
        ],
      },
      {
        title: "Your learning experience",
        questions: [
          ["likert", "How far do you agree with the following?", { required: true, config: { rows: [{ id: "r1", label: "Lessons are well organised" }, { id: "r2", label: "I understand what is expected of me" }, { id: "r3", label: "I receive useful feedback" }, { id: "r4", label: "Learning materials are easy to access" }], scaleLabels: likert5 } }],
          ["rating", "Overall, how would you rate your learning experience?", { required: true, config: { scaleMax: 5, icon: "star" } }],
          ["long_text", "What is working well?"],
          ["long_text", "What should be improved?"],
        ],
      },
    ],
  },
  {
    slug: "course-evaluation",
    category: "Education",
    title: "Course evaluation",
    summary: "End-of-course evaluation of content, delivery, workload and outcomes.",
    sections: [
      {
        title: "Course",
        questions: [
          ["short_text", "Course code or name", { required: true }],
          ["likert", "Rate the course", { required: true, config: { rows: [{ id: "c1", label: "Course objectives were clear" }, { id: "c2", label: "Content was relevant" }, { id: "c3", label: "Workload was manageable" }, { id: "c4", label: "Assessments matched the content" }], scaleLabels: likert5 } }],
          ["linear_scale", "How likely are you to recommend this course to another student?", { required: true, config: { scaleMin: 1, scaleMax: 10, minLabel: "Not likely", maxLabel: "Very likely" } }],
          ["long_text", "Any other comments about the course?"],
        ],
      },
    ],
  },
  {
    slug: "teacher-evaluation",
    category: "Education",
    title: "Teacher evaluation",
    summary: "Anonymous evaluation of a teacher's preparation, clarity and support.",
    sections: [
      {
        title: "Teacher evaluation",
        description: "Your responses are anonymous. Please be honest and constructive.",
        questions: [
          ["short_text", "Subject", { required: true }],
          ["likert", "The teacher…", { required: true, config: { rows: [{ id: "t1", label: "Comes to class prepared" }, { id: "t2", label: "Explains concepts clearly" }, { id: "t3", label: "Encourages questions" }, { id: "t4", label: "Treats students fairly" }, { id: "t5", label: "Returns work promptly" }], scaleLabels: likert5 } }],
          ["rating", "Overall rating of the teacher", { required: true, config: { scaleMax: 5, icon: "star" } }],
          ["long_text", "What could the teacher do to help you learn better?"],
        ],
      },
    ],
  },
  {
    slug: "student-registration",
    category: "Education",
    title: "Student registration",
    summary: "Register new students with contact and guardian details.",
    sections: [
      {
        title: "Student details",
        questions: [
          ["short_text", "Full name", { required: true }],
          ["date", "Date of birth", { required: true }],
          ["single_choice", "Gender", { options: ["Female", "Male", "Prefer not to say"] }],
          ["dropdown", "Class / programme applying for", { required: true, options: ["Class 1", "Class 2", "Class 3", "JHS 1", "JHS 2", "JHS 3", "SHS 1"] }],
          ["email", "Email address"],
          ["phone", "Phone number", { required: true }],
        ],
      },
      {
        title: "Parent or guardian",
        questions: [
          ["short_text", "Guardian's full name", { required: true }],
          ["phone", "Guardian's phone number", { required: true }],
          ["long_text", "Medical conditions or special needs we should know about"],
        ],
      },
    ],
  },
  {
    slug: "examination-feedback",
    category: "Education",
    title: "Examination feedback",
    summary: "Understand how students experienced an examination.",
    sections: [
      {
        title: "Examination",
        questions: [
          ["short_text", "Examination / paper", { required: true }],
          ["single_choice", "How difficult was the examination?", { required: true, options: ["Very easy", "Easy", "Moderate", "Difficult", "Very difficult"] }],
          ["yes_no", "Was the time allowed sufficient?", { required: true }],
          ["long_text", "What made the time insufficient?", { showIf: { q: 2, op: "equals", value: "no" } }],
          ["yes_no", "Did the examination cover what was taught?", { required: true }],
          ["long_text", "Other comments"],
        ],
      },
    ],
  },
  {
    slug: "school-climate-survey",
    category: "Education",
    title: "School climate survey",
    summary: "Measure safety, belonging and wellbeing across a school community.",
    sections: [
      {
        title: "About you",
        questions: [["single_choice", "I am a…", { required: true, options: ["Student", "Parent / guardian", "Teacher", "Other staff"] }]],
      },
      {
        title: "School climate",
        questions: [
          ["likert", "How far do you agree?", { required: true, config: { rows: [{ id: "s1", label: "I feel safe at school" }, { id: "s2", label: "I feel I belong at this school" }, { id: "s3", label: "Bullying is dealt with effectively" }, { id: "s4", label: "The school communicates well with families" }], scaleLabels: likert5 } }],
          ["multiple_choice", "Which areas need the most attention?", { options: ["Facilities", "Teaching quality", "Discipline", "Communication", "Extracurricular activities", "Safety"], config: { allowOther: true } }],
          ["long_text", "One thing the school should change"],
        ],
      },
    ],
  },
  // ---------------- Research ----------------
  {
    slug: "academic-research-questionnaire",
    category: "Research",
    title: "Academic research questionnaire",
    summary: "A structured questionnaire with consent, demographics and core measures.",
    sections: [
      {
        title: "Consent",
        description: "This study is conducted for academic research. Participation is voluntary and you may stop at any time.",
        questions: [
          ["statement", "Your responses will be kept confidential and reported only in aggregate."],
          ["yes_no", "Do you agree to take part in this study?", { required: true }],
        ],
      },
      {
        title: "Demographics",
        questions: [
          ["single_choice", "Gender", { required: true, options: ["Female", "Male", "Prefer not to say"] }],
          ["dropdown", "Age group", { required: true, options: ["18–24", "25–34", "35–44", "45–54", "55+"] }],
          ["dropdown", "Highest level of education", { options: ["Basic", "Secondary", "Diploma", "Bachelor's", "Master's", "Doctorate"] }],
        ],
      },
      {
        title: "Main questions",
        questions: [
          ["likert", "Please indicate your level of agreement", { required: true, config: { rows: [{ id: "m1", label: "Statement 1" }, { id: "m2", label: "Statement 2" }, { id: "m3", label: "Statement 3" }], scaleLabels: likert5 } }],
          ["long_text", "Please explain your views in your own words"],
        ],
      },
    ],
  },
  {
    slug: "market-research",
    category: "Research",
    title: "Market research",
    summary: "Understand demand, preferences and price sensitivity for a product or service.",
    sections: [
      {
        title: "Market research",
        questions: [
          ["dropdown", "Age group", { required: true, options: ["Under 18", "18–24", "25–34", "35–44", "45+"] }],
          ["single_choice", "How often do you buy products in this category?", { required: true, options: ["Weekly", "Monthly", "A few times a year", "Rarely", "Never"] }],
          ["multiple_choice", "What matters most when choosing a product?", { required: true, options: ["Price", "Quality", "Brand", "Availability", "Recommendations", "Customer service"], config: { maxSelections: 3 } }],
          ["number", "How much would you be willing to pay (GHS)?", { config: { min: 0 } }],
          ["linear_scale", "How interested are you in a new product in this category?", { required: true, config: { scaleMin: 1, scaleMax: 5, minLabel: "Not interested", maxLabel: "Very interested" } }],
          ["long_text", "What problems do you face with current products?"],
        ],
      },
    ],
  },
  {
    slug: "customer-behaviour",
    category: "Research",
    title: "Customer behaviour study",
    summary: "Study purchasing channels, habits and motivations.",
    sections: [
      {
        title: "Customer behaviour",
        questions: [
          ["multiple_choice", "Where do you usually shop?", { required: true, options: ["Open market", "Supermarket", "Online", "Neighbourhood shop", "Social media sellers"], config: { allowOther: true } }],
          ["single_choice", "Which payment method do you use most?", { required: true, options: ["Cash", "Mobile money", "Card", "Bank transfer"] }],
          ["single_choice", "Which mobile network do you use most?", { options: ["MTN", "Telecel", "AT", "Other"] }],
          ["rating", "How satisfied are you with your usual shopping experience?", { config: { scaleMax: 5, icon: "star" } }],
          ["long_text", "What would make you switch to a different store?"],
        ],
      },
    ],
  },
  {
    slug: "public-opinion-poll",
    category: "Research",
    title: "Public opinion poll",
    summary: "Capture public views on a policy, issue or service.",
    sections: [
      {
        title: "Your opinion",
        questions: [
          ["dropdown", "Region", { required: true, options: ["Greater Accra", "Ashanti", "Western", "Central", "Eastern", "Volta", "Northern", "Upper East", "Upper West", "Bono", "Other"] }],
          ["single_choice", "Do you support the proposal?", { required: true, options: ["Strongly support", "Support", "Undecided", "Oppose", "Strongly oppose"] }],
          ["multiple_choice", "What is the main reason for your view?", { options: ["Cost", "Fairness", "Effectiveness", "Personal impact", "Trust in institutions"], config: { allowOther: true } }],
          ["long_text", "Any other comments?"],
        ],
      },
    ],
  },
  {
    slug: "demographic-survey",
    category: "Research",
    title: "Demographic survey",
    summary: "Standard demographic questions for segmentation and comparison.",
    sections: [
      {
        title: "About you",
        description: "These questions help us compare responses between groups. You may skip any question.",
        questions: [
          ["single_choice", "Gender", { options: ["Female", "Male", "Prefer not to say"] }],
          ["dropdown", "Age group", { options: ["Under 18", "18–24", "25–34", "35–44", "45–54", "55–64", "65+"] }],
          ["single_choice", "Employment status", { options: ["Employed full-time", "Employed part-time", "Self-employed", "Student", "Unemployed", "Retired"] }],
          ["dropdown", "Highest education", { options: ["None", "Basic", "Secondary", "Tertiary", "Postgraduate"] }],
          ["single_choice", "Area of residence", { options: ["Urban", "Peri-urban", "Rural"] }],
        ],
      },
    ],
  },
  // ---------------- Business ----------------
  {
    slug: "customer-satisfaction",
    category: "Business",
    title: "Customer satisfaction (CSAT + NPS)",
    summary: "Measure satisfaction and likelihood to recommend, with follow-up on detractors.",
    sections: [
      {
        title: "Your experience",
        questions: [
          ["single_choice", "Overall, how satisfied are you with our service?", { required: true, options: satisfaction }],
          ["linear_scale", "How likely are you to recommend us to a friend or colleague?", { required: true, config: { scaleMin: 0, scaleMax: 10, minLabel: "Not at all likely", maxLabel: "Extremely likely" } }],
          ["multiple_choice", "What did you like most?", { options: ["Speed", "Price", "Staff friendliness", "Product quality", "Convenience"], config: { allowOther: true } }],
          ["long_text", "What could we do better?"],
        ],
      },
    ],
  },
  {
    slug: "product-feedback",
    category: "Business",
    title: "Product feedback",
    summary: "Collect structured feedback on features, usability and value.",
    sections: [
      {
        title: "Product feedback",
        questions: [
          ["single_choice", "How often do you use the product?", { required: true, options: ["Daily", "Weekly", "Monthly", "Less often"] }],
          ["rating", "How easy is the product to use?", { required: true, config: { scaleMax: 5, icon: "star" } }],
          ["rating", "How well does it meet your needs?", { required: true, config: { scaleMax: 5, icon: "star" } }],
          ["yes_no", "Have you experienced any problems?", { required: true }],
          ["long_text", "Please describe the problem", { showIf: { q: 3, op: "equals", value: "yes" }, required: true }],
          ["long_text", "Which feature would you most like us to add?"],
        ],
      },
    ],
  },
  {
    slug: "employee-feedback",
    category: "Business",
    title: "Employee feedback",
    summary: "Anonymous pulse on engagement, management and wellbeing.",
    sections: [
      {
        title: "Employee feedback",
        description: "This survey is anonymous.",
        questions: [
          ["dropdown", "Department", { options: ["Operations", "Sales", "Finance", "HR", "IT", "Other"] }],
          ["likert", "How far do you agree?", { required: true, config: { rows: [{ id: "e1", label: "I understand my goals" }, { id: "e2", label: "My manager supports my development" }, { id: "e3", label: "I have the tools I need" }, { id: "e4", label: "I feel valued at work" }, { id: "e5", label: "My workload is manageable" }], scaleLabels: likert5 } }],
          ["linear_scale", "How likely are you to recommend this organisation as a place to work?", { required: true, config: { scaleMin: 0, scaleMax: 10 } }],
          ["long_text", "What one change would improve your work life?"],
        ],
      },
    ],
  },
  {
    slug: "event-registration",
    category: "Business",
    title: "Event registration",
    summary: "Register attendees with session preferences and requirements.",
    sections: [
      {
        title: "Registration",
        questions: [
          ["short_text", "Full name", { required: true }],
          ["email", "Email address", { required: true }],
          ["phone", "Phone number"],
          ["short_text", "Organisation"],
          ["multiple_choice", "Which sessions will you attend?", { required: true, options: ["Morning keynote", "Workshop A", "Workshop B", "Panel discussion", "Networking"] }],
          ["single_choice", "Dietary requirements", { options: ["None", "Vegetarian", "Vegan", "Halal"], config: { allowOther: true } }],
        ],
      },
    ],
  },
  {
    slug: "service-evaluation",
    category: "Business",
    title: "Service evaluation",
    summary: "Evaluate a service visit across timeliness, quality and staff.",
    sections: [
      {
        title: "Service evaluation",
        questions: [
          ["date", "Date of visit"],
          ["likert", "Rate the following", { required: true, config: { rows: [{ id: "v1", label: "Waiting time was reasonable" }, { id: "v2", label: "Staff were courteous" }, { id: "v3", label: "My issue was resolved" }, { id: "v4", label: "The environment was clean" }], scaleLabels: likert5 } }],
          ["rating", "Overall rating", { required: true, config: { scaleMax: 5, icon: "star" } }],
          ["long_text", "Comments"],
        ],
      },
    ],
  },
  // ---------------- Organisations ----------------
  {
    slug: "membership-registration",
    category: "Organisations",
    title: "Membership registration",
    summary: "Register members with contact details and areas of interest.",
    sections: [
      {
        title: "Membership",
        questions: [
          ["short_text", "Full name", { required: true }],
          ["phone", "Phone number", { required: true }],
          ["email", "Email address"],
          ["short_text", "Residential area"],
          ["single_choice", "Membership type", { required: true, options: ["Full member", "Associate member", "Youth member"] }],
          ["multiple_choice", "Which groups or ministries would you like to join?", { options: ["Choir", "Ushering", "Youth", "Welfare", "Media", "Prayer"], config: { allowOther: true } }],
        ],
      },
    ],
  },
  {
    slug: "volunteer-registration",
    category: "Organisations",
    title: "Volunteer registration",
    summary: "Recruit volunteers and capture skills and availability.",
    sections: [
      {
        title: "Volunteer details",
        questions: [
          ["short_text", "Full name", { required: true }],
          ["phone", "Phone number", { required: true }],
          ["email", "Email address"],
          ["multiple_choice", "Skills you can offer", { options: ["Teaching", "Administration", "Logistics", "Media & design", "Health", "Fundraising"], config: { allowOther: true } }],
          ["multiple_choice", "Availability", { required: true, options: ["Weekday mornings", "Weekday evenings", "Saturdays", "Sundays"] }],
          ["long_text", "Why do you want to volunteer?"],
        ],
      },
    ],
  },
  {
    slug: "event-feedback",
    category: "Organisations",
    title: "Event feedback",
    summary: "Post-event survey on content, organisation and impact.",
    sections: [
      {
        title: "Event feedback",
        questions: [
          ["rating", "How would you rate the event overall?", { required: true, config: { scaleMax: 5, icon: "star" } }],
          ["likert", "How far do you agree?", { config: { rows: [{ id: "f1", label: "The event was well organised" }, { id: "f2", label: "The content was useful" }, { id: "f3", label: "The venue was suitable" }], scaleLabels: likert5 } }],
          ["yes_no", "Would you attend a future event?", { required: true }],
          ["long_text", "What should we do differently next time?"],
        ],
      },
    ],
  },
  {
    slug: "community-needs-assessment",
    category: "Organisations",
    title: "Community needs assessment",
    summary: "Identify priority needs and access to services in a community.",
    sections: [
      {
        title: "Household",
        questions: [
          ["short_text", "Community / town", { required: true }],
          ["number", "Number of people in your household", { config: { min: 1, max: 50, integerOnly: true } }],
          ["single_choice", "Main source of drinking water", { options: ["Pipe-borne", "Borehole", "Well", "River / stream", "Sachet / bottled"], config: { allowOther: true } }],
        ],
      },
      {
        title: "Needs",
        questions: [
          ["multiple_choice", "What are the most pressing needs in your community?", { required: true, options: ["Clean water", "Healthcare", "Education", "Roads", "Electricity", "Jobs", "Security", "Sanitation"], config: { maxSelections: 3 } }],
          ["linear_scale", "How easy is it to access healthcare?", { config: { scaleMin: 1, scaleMax: 5, minLabel: "Very difficult", maxLabel: "Very easy" } }],
          ["long_text", "Describe the biggest challenge your household faces"],
        ],
      },
    ],
  },
];

/** Expand a compact spec into a full, valid form definition with stable ids. */
export function buildTemplateDefinition(spec: TemplateSpec): FormDefinition {
  const sections = spec.sections.map((s, si) => ({ id: seededId(`${spec.slug}:s${si}`), title: s.title, description: s.description ?? "", jumps: [] }));
  const questions: Question[] = [];
  spec.sections.forEach((s, si) => {
    const sectionQs: Question[] = [];
    s.questions.forEach(([type, title, extra = {}], qi) => {
      const id = seededId(`${spec.slug}:s${si}:q${qi}`);
      const config: QuestionConfig = { ...(extra.config ?? {}) };
      if (extra.options) config.options = extra.options.map((label, oi) => ({ id: `o${oi + 1}`, label }));
      if (type === "rating" && !config.scaleMax) config.scaleMax = 5;
      if (type === "linear_scale") {
        config.scaleMin = config.scaleMin ?? 1;
        config.scaleMax = config.scaleMax ?? 5;
      }
      const q: Question = { id, sectionId: sections[si].id, type, title, description: extra.description ?? "", required: !!extra.required, config, visibility: null };
      if (extra.showIf) {
        const target = sectionQs[extra.showIf.q];
        if (target) q.visibility = { match: "all", conditions: [{ questionId: target.id, operator: extra.showIf.op, value: extra.showIf.value }] };
      }
      sectionQs.push(q);
    });
    questions.push(...sectionQs);
  });
  return {
    title: spec.title,
    description: spec.summary,
    coverImageUrl: null,
    logoUrl: null,
    theme: themeSchema.parse({}),
    settings: formSettingsSchema.parse({}),
    sections,
    questions,
  };
}

/** Clone a definition giving every section/question a fresh id and remapping logic references. */
export function cloneDefinitionWithNewIds(def: FormDefinition, makeId: () => string = () => crypto.randomUUID()): FormDefinition {
  const map = new Map<string, string>();
  const remap = (id: string) => {
    if (!map.has(id)) map.set(id, makeId());
    return map.get(id)!;
  };
  def.sections.forEach((s) => remap(s.id));
  def.questions.forEach((q) => remap(q.id));
  const remapGroup = <T extends { conditions: { questionId: string }[] }>(g: T): T => ({ ...g, conditions: g.conditions.map((c) => ({ ...c, questionId: map.get(c.questionId) ?? c.questionId })) });
  return {
    ...def,
    sections: def.sections.map((s) => ({ ...s, id: remap(s.id), jumps: s.jumps.map((j) => ({ goTo: j.goTo === "submit" ? "submit" : (map.get(j.goTo) ?? j.goTo), when: remapGroup(j.when) })) })),
    questions: def.questions.map((q) => ({ ...q, id: remap(q.id), sectionId: remap(q.sectionId), visibility: q.visibility ? remapGroup(q.visibility) : null })),
  };
}
