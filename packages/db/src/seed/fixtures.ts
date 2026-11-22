/**
 * DEMONSTRATION DATA. Every client, person, project, booking and amount below is fictional.
 * None of it describes Neon Minds' real clients, staff or finances.
 * Day offsets are relative to the day the seed runs, so the workspace always looks current.
 */
import type {
  AssetCategory,
  ClientStatus,
  LeadSource,
  LeadStage,
  Priority,
  ProjectStatus,
  ProjectType,
  StageKey,
  StudioLocation,
} from '../models/enums';

// ─── Workflow templates ───────────────────────────────────────────────────────

export interface StageFixture {
  key: StageKey;
  label: string;
  expectedDays: number;
  requiresApproval?: boolean;
  skippable?: boolean;
  exitCriteria: string[];
}

export const TEMPLATES: {
  name: string;
  description: string;
  isDefault: boolean;
  stages: StageFixture[];
}[] = [
  {
    name: 'Standard production',
    description: 'Full lifecycle for brand films, ads, corporate and product videos.',
    isDefault: true,
    stages: [
      {
        key: 'BRIEF',
        label: 'Brief',
        expectedDays: 4,
        requiresApproval: true,
        exitCriteria: ['Creative treatment approved by client', 'Budget and schedule agreed'],
      },
      {
        key: 'PRE_PRODUCTION',
        label: 'Pre-production',
        expectedDays: 8,
        exitCriteria: [
          'Script and storyboard locked',
          'Shot list, locations and talent confirmed',
          'Equipment booked',
        ],
      },
      {
        key: 'SHOOT',
        label: 'Shoot',
        expectedDays: 3,
        exitCriteria: ['All scheduled scenes captured', 'Footage backed up in two locations'],
      },
      {
        key: 'EDIT',
        label: 'Edit',
        expectedDays: 10,
        exitCriteria: ['Picture lock', 'Grade, sound mix and titles complete'],
      },
      {
        key: 'REVIEW',
        label: 'Review',
        expectedDays: 5,
        requiresApproval: true,
        exitCriteria: ['Client approval on final cut'],
      },
      {
        key: 'DELIVERY',
        label: 'Delivery',
        expectedDays: 2,
        exitCriteria: ['Masters and cut-downs exported and QC passed', 'Files handed over'],
      },
    ],
  },
  {
    name: 'Social sprint',
    description: 'Compressed lifecycle for reels and social content packs.',
    isDefault: false,
    stages: [
      {
        key: 'BRIEF',
        label: 'Brief',
        expectedDays: 1,
        requiresApproval: true,
        exitCriteria: ['Content plan approved'],
      },
      {
        key: 'PRE_PRODUCTION',
        label: 'Pre-production',
        expectedDays: 2,
        skippable: true,
        exitCriteria: ['Hooks and shot list ready'],
      },
      { key: 'SHOOT', label: 'Shoot', expectedDays: 1, exitCriteria: ['All reels captured'] },
      {
        key: 'EDIT',
        label: 'Edit',
        expectedDays: 3,
        exitCriteria: ['All reels cut with captions'],
      },
      {
        key: 'REVIEW',
        label: 'Review',
        expectedDays: 2,
        requiresApproval: true,
        exitCriteria: ['Client approval on reel pack'],
      },
      {
        key: 'DELIVERY',
        label: 'Delivery',
        expectedDays: 1,
        exitCriteria: ['Reels delivered in platform formats'],
      },
    ],
  },
];

// ─── Team ─────────────────────────────────────────────────────────────────────

export type RoleTag =
  | 'director'
  | 'dop'
  | 'editor'
  | 'colourist'
  | 'motion'
  | 'producer'
  | 'coordinator'
  | 'camera'
  | 'editor2'
  | 'sound'
  | 'ai';

export const TEAM: {
  tag: RoleTag;
  name: string;
  title: string;
  skills: string[];
  baseLocation: StudioLocation;
  weeklyCapacityHours: number;
}[] = [
  {
    tag: 'director',
    name: 'Riya Menon',
    title: 'Director',
    skills: ['Direction', 'Storyboarding', 'Client pitching'],
    baseLocation: 'KOZHIKODE',
    weeklyCapacityHours: 40,
  },
  {
    tag: 'dop',
    name: 'Arjun Nair',
    title: 'Director of Photography',
    skills: ['Cinematography', 'Lighting', 'Macro'],
    baseLocation: 'KOZHIKODE',
    weeklyCapacityHours: 40,
  },
  {
    tag: 'colourist',
    name: 'Fathima Rahman',
    title: 'Editor & Colourist',
    skills: ['DaVinci Resolve', 'Colour grading', 'Editing'],
    baseLocation: 'KOZHIKODE',
    weeklyCapacityHours: 40,
  },
  {
    tag: 'motion',
    name: 'Naseeh Ali',
    title: 'Motion Designer',
    skills: ['After Effects', '3D', 'Typography'],
    baseLocation: 'KOZHIKODE',
    weeklyCapacityHours: 40,
  },
  {
    tag: 'producer',
    name: 'Karthik Subramanian',
    title: 'Producer',
    skills: ['Budgeting', 'Client management', 'Scheduling'],
    baseLocation: 'CHENNAI',
    weeklyCapacityHours: 45,
  },
  {
    tag: 'coordinator',
    name: 'Meera Krishnan',
    title: 'Production Coordinator',
    skills: ['Logistics', 'Casting', 'Locations'],
    baseLocation: 'CHENNAI',
    weeklyCapacityHours: 40,
  },
  {
    tag: 'camera',
    name: 'Vishnu Prasad',
    title: 'Camera Operator & Drone Pilot',
    skills: ['Gimbal', 'Drone (DGCA certified)', 'Data wrangling'],
    baseLocation: 'KOZHIKODE',
    weeklyCapacityHours: 40,
  },
  {
    tag: 'editor',
    name: 'Divya Raghavan',
    title: 'Editor',
    skills: ['Premiere Pro', 'Social edits', 'Captions'],
    baseLocation: 'CHENNAI',
    weeklyCapacityHours: 40,
  },
  {
    tag: 'sound',
    name: 'Sreejith Kumar',
    title: 'Sound Designer',
    skills: ['Location sound', 'Mixing', 'Foley'],
    baseLocation: 'KOZHIKODE',
    weeklyCapacityHours: 32,
  },
  {
    tag: 'ai',
    name: 'Ananya Iyer',
    title: 'AI & VFX Artist',
    skills: ['Generative previs', 'Compositing', 'Clean-up'],
    baseLocation: 'CHENNAI',
    weeklyCapacityHours: 40,
  },
];

// ─── Clients ──────────────────────────────────────────────────────────────────

export type ClientTag =
  'aurora' | 'zenpods' | 'neotech' | 'vibe' | 'malabar' | 'coastline' | 'brightpath' | 'carefirst';

export const CLIENTS: {
  tag: ClientTag;
  name: string;
  industry: string;
  city: string;
  status: ClientStatus;
  contactName: string;
  accentColor: string;
}[] = [
  {
    tag: 'aurora',
    name: 'Aurora Threads',
    industry: 'D2C fashion',
    city: 'Kozhikode',
    status: 'ACTIVE',
    contactName: 'Nila Thomas',
    accentColor: '#e8a87c',
  },
  {
    tag: 'zenpods',
    name: 'ZenPods Audio',
    industry: 'Consumer electronics',
    city: 'Chennai',
    status: 'ACTIVE',
    contactName: 'Rahul Varma',
    accentColor: '#8ab4f8',
  },
  {
    tag: 'neotech',
    name: 'NeoTech Systems',
    industry: 'B2B software',
    city: 'Chennai',
    status: 'ACTIVE',
    contactName: 'Priya Sundar',
    accentColor: '#7fd1b9',
  },
  {
    tag: 'vibe',
    name: 'Vibe Beverages',
    industry: 'FMCG',
    city: 'Kochi',
    status: 'ACTIVE',
    contactName: 'Aditya Rao',
    accentColor: '#f5c26b',
  },
  {
    tag: 'malabar',
    name: 'Malabar Heights Realty',
    industry: 'Real estate',
    city: 'Kozhikode',
    status: 'ACTIVE',
    contactName: 'Shameer K.',
    accentColor: '#c3a6ff',
  },
  {
    tag: 'coastline',
    name: 'Coastline Resorts',
    industry: 'Hospitality',
    city: 'Kozhikode',
    status: 'ACTIVE',
    contactName: 'Leena Joseph',
    accentColor: '#6fc3df',
  },
  {
    tag: 'brightpath',
    name: 'BrightPath Academy',
    industry: 'Education',
    city: 'Chennai',
    status: 'ACTIVE',
    contactName: 'Harish Kumar',
    accentColor: '#f28b82',
  },
  {
    tag: 'carefirst',
    name: 'CareFirst Clinics',
    industry: 'Healthcare',
    city: 'Kozhikode',
    status: 'ACTIVE',
    contactName: 'Dr. Anjali Das',
    accentColor: '#a8d5a2',
  },
];

// ─── Projects ─────────────────────────────────────────────────────────────────

export interface ProjectFixture {
  tag: string;
  code: string;
  title: string;
  logline: string;
  client: ClientTag;
  type: ProjectType;
  template: 'Standard production' | 'Social sprint';
  status: ProjectStatus;
  priority: Priority;
  location: StudioLocation;
  startOffset: number;
  dueOffset: number;
  /** Stage the project is in now; null when delivered. */
  stage: StageKey | null;
  /** How far through the current stage (0..1) task completion is. */
  stageProgress: number;
  budget: number;
  includedRevisions: number;
  aiAssisted: boolean;
  director: RoleTag;
  editor: RoleTag;
  skipStages?: StageKey[];
}

export const PROJECTS: ProjectFixture[] = [
  {
    tag: 'aurora-film',
    code: 'NM-26-031',
    title: 'Woven Light',
    logline: 'A cinematic journey through the hands that make every Aurora garment.',
    client: 'aurora',
    type: 'BRAND_FILM',
    template: 'Standard production',
    status: 'ACTIVE',
    priority: 'HIGH',
    location: 'KOZHIKODE',
    startOffset: -32,
    dueOffset: 6,
    stage: 'EDIT',
    stageProgress: 0.5,
    budget: 650000,
    includedRevisions: 2,
    aiAssisted: true,
    director: 'director',
    editor: 'colourist',
  },
  {
    tag: 'zenpods-hero',
    code: 'NM-26-032',
    title: 'Feel the Sound',
    logline: 'Macro product film for the ZenPods Pro launch.',
    client: 'zenpods',
    type: 'PRODUCT_VIDEO',
    template: 'Standard production',
    status: 'ACTIVE',
    priority: 'HIGH',
    location: 'KOZHIKODE',
    startOffset: -30,
    dueOffset: 2,
    stage: 'REVIEW',
    stageProgress: 0.34,
    budget: 320000,
    includedRevisions: 2,
    aiAssisted: false,
    director: 'director',
    editor: 'colourist',
  },
  {
    tag: 'neotech-corp',
    code: 'NM-26-033',
    title: 'Building Tomorrow',
    logline: 'Corporate film introducing NeoTech’s engineering culture.',
    client: 'neotech',
    type: 'CORPORATE_VIDEO',
    template: 'Standard production',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    location: 'CHENNAI',
    startOffset: -16,
    dueOffset: 18,
    stage: 'SHOOT',
    stageProgress: 0,
    budget: 480000,
    includedRevisions: 2,
    aiAssisted: false,
    director: 'director',
    editor: 'editor',
  },
  {
    tag: 'vibe-reels',
    code: 'NM-26-034',
    title: 'Summer Reels',
    logline: 'Six vertical reels for Vibe’s summer flavour drop.',
    client: 'vibe',
    type: 'SOCIAL_REEL',
    template: 'Social sprint',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    location: 'KOZHIKODE',
    startOffset: -4,
    dueOffset: 9,
    stage: 'PRE_PRODUCTION',
    stageProgress: 0.5,
    budget: 180000,
    includedRevisions: 2,
    aiAssisted: true,
    director: 'director',
    editor: 'editor',
  },
  {
    tag: 'malabar-skyline',
    code: 'NM-26-035',
    title: 'Skyline Residences',
    logline: 'Aerial-led launch film for a riverside residential tower.',
    client: 'malabar',
    type: 'REAL_ESTATE',
    template: 'Standard production',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    location: 'KOZHIKODE',
    startOffset: -10,
    dueOffset: 20,
    stage: 'PRE_PRODUCTION',
    stageProgress: 0.6,
    budget: 380000,
    includedRevisions: 2,
    aiAssisted: false,
    director: 'director',
    editor: 'colourist',
  },
  {
    tag: 'coastline-ad',
    code: 'NM-26-036',
    title: 'Monsoon Escape',
    logline: 'A storytelling ad about rediscovering slow travel in the rain.',
    client: 'coastline',
    type: 'STORYTELLING_AD',
    template: 'Standard production',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    location: 'KOZHIKODE',
    startOffset: -3,
    dueOffset: 35,
    stage: 'BRIEF',
    stageProgress: 0.34,
    budget: 540000,
    includedRevisions: 2,
    aiAssisted: true,
    director: 'director',
    editor: 'colourist',
  },
  {
    tag: 'brightpath-stories',
    code: 'NM-26-037',
    title: 'Campus Stories',
    logline: 'Student-led explainer series about learning at BrightPath.',
    client: 'brightpath',
    type: 'EXPLAINER',
    template: 'Standard production',
    status: 'ACTIVE',
    priority: 'LOW',
    location: 'CHENNAI',
    startOffset: -26,
    dueOffset: 12,
    stage: 'EDIT',
    stageProgress: 0.4,
    budget: 260000,
    includedRevisions: 2,
    aiAssisted: false,
    director: 'director',
    editor: 'editor',
  },
  {
    tag: 'carefirst-ad',
    code: 'NM-26-038',
    title: 'A Day of Care',
    logline: 'Following a nurse through one ordinary, extraordinary shift.',
    client: 'carefirst',
    type: 'STORYTELLING_AD',
    template: 'Standard production',
    status: 'ACTIVE',
    priority: 'HIGH',
    location: 'KOZHIKODE',
    startOffset: -18,
    dueOffset: 16,
    stage: 'SHOOT',
    stageProgress: 0.34,
    budget: 420000,
    includedRevisions: 2,
    aiAssisted: false,
    director: 'director',
    editor: 'colourist',
  },
  {
    tag: 'zenpods-reels',
    code: 'NM-26-039',
    title: 'Unboxing Reels',
    logline: 'Four unboxing reels for ZenPods marketplace listings.',
    client: 'zenpods',
    type: 'SOCIAL_REEL',
    template: 'Social sprint',
    status: 'ACTIVE',
    priority: 'URGENT',
    location: 'CHENNAI',
    startOffset: -14,
    dueOffset: -2,
    stage: 'REVIEW',
    stageProgress: 0.34,
    budget: 120000,
    includedRevisions: 2,
    aiAssisted: false,
    director: 'producer',
    editor: 'editor',
  },
  {
    tag: 'neotech-demo',
    code: 'NM-26-040',
    title: 'Product Demo v4',
    logline: 'Motion-graphics walkthrough of the NeoTech dashboard release.',
    client: 'neotech',
    type: 'PRODUCT_DEMO',
    template: 'Standard production',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    location: 'CHENNAI',
    startOffset: -24,
    dueOffset: 1,
    stage: 'DELIVERY',
    stageProgress: 0.34,
    budget: 210000,
    includedRevisions: 2,
    aiAssisted: true,
    director: 'motion',
    editor: 'motion',
    skipStages: ['SHOOT'],
  },
  {
    tag: 'aurora-lookbook',
    code: 'NM-26-027',
    title: 'Festive Lookbook',
    logline: 'Campaign video for Aurora’s festive collection.',
    client: 'aurora',
    type: 'CAMPAIGN',
    template: 'Standard production',
    status: 'DELIVERED',
    priority: 'MEDIUM',
    location: 'KOZHIKODE',
    startOffset: -62,
    dueOffset: -10,
    stage: null,
    stageProgress: 1,
    budget: 350000,
    includedRevisions: 2,
    aiAssisted: false,
    director: 'director',
    editor: 'colourist',
  },
  {
    tag: 'malabar-walkthrough',
    code: 'NM-26-029',
    title: 'Show Villa Walkthrough',
    logline: 'Gimbal walkthrough of the Malabar Heights show villa.',
    client: 'malabar',
    type: 'REAL_ESTATE',
    template: 'Standard production',
    status: 'DELIVERED',
    priority: 'LOW',
    location: 'KOZHIKODE',
    startOffset: -55,
    dueOffset: -18,
    stage: null,
    stageProgress: 1,
    budget: 160000,
    includedRevisions: 2,
    aiAssisted: false,
    director: 'dop',
    editor: 'editor',
  },
];

// ─── Tasks per stage (generated for every project) ────────────────────────────

export interface TaskTemplate {
  title: string;
  role: RoleTag | 'projectDirector' | 'projectEditor';
  hours: number;
  blocking: boolean;
  /** Index (within the same stage) of the task this one depends on. */
  after?: number;
}

export const STAGE_TASKS: Record<StageKey, TaskTemplate[]> = {
  BRIEF: [
    { title: 'Discovery call and brief capture', role: 'producer', hours: 3, blocking: false },
    { title: 'Creative treatment', role: 'projectDirector', hours: 10, blocking: true, after: 0 },
    { title: 'Budget and schedule estimate', role: 'producer', hours: 4, blocking: true, after: 0 },
  ],
  PRE_PRODUCTION: [
    { title: 'Script and storyboard', role: 'projectDirector', hours: 14, blocking: true },
    { title: 'Shot list and camera plan', role: 'dop', hours: 6, blocking: true, after: 0 },
    { title: 'Location recce and permits', role: 'coordinator', hours: 8, blocking: true },
    { title: 'Talent and wardrobe confirmation', role: 'coordinator', hours: 6, blocking: false },
    { title: 'Equipment booking', role: 'dop', hours: 2, blocking: true, after: 1 },
  ],
  SHOOT: [
    { title: 'Principal photography', role: 'dop', hours: 12, blocking: true },
    { title: 'Data wrangling and dual backup', role: 'camera', hours: 4, blocking: true, after: 0 },
    { title: 'Behind-the-scenes stills for client', role: 'camera', hours: 2, blocking: false },
  ],
  EDIT: [
    { title: 'Assembly cut', role: 'projectEditor', hours: 12, blocking: true },
    { title: 'Rough cut', role: 'projectEditor', hours: 14, blocking: true, after: 0 },
    { title: 'Colour grade', role: 'colourist', hours: 10, blocking: true, after: 1 },
    { title: 'Sound design and mix', role: 'sound', hours: 8, blocking: true, after: 1 },
    { title: 'Titles and motion graphics', role: 'motion', hours: 8, blocking: false, after: 1 },
  ],
  REVIEW: [
    { title: 'Send review link to client', role: 'producer', hours: 1, blocking: true },
    { title: 'Consolidate client feedback', role: 'producer', hours: 2, blocking: false, after: 0 },
    { title: 'Apply revisions', role: 'projectEditor', hours: 8, blocking: true, after: 1 },
  ],
  DELIVERY: [
    { title: 'Export masters and cut-downs', role: 'projectEditor', hours: 4, blocking: true },
    { title: 'Quality check', role: 'projectDirector', hours: 2, blocking: true, after: 0 },
    { title: 'Upload and handover', role: 'producer', hours: 1, blocking: true, after: 1 },
  ],
};

// ─── Equipment ────────────────────────────────────────────────────────────────

export const ASSETS: {
  tag: string;
  name: string;
  category: AssetCategory;
  homeLocation: StudioLocation;
  dailyRate: number;
  maintenance?: boolean;
}[] = [
  {
    tag: 'fx6-a',
    name: 'Sony FX6 — A-cam',
    category: 'CAMERA',
    homeLocation: 'KOZHIKODE',
    dailyRate: 9000,
  },
  {
    tag: 'fx6-b',
    name: 'Sony FX6 — B-cam',
    category: 'CAMERA',
    homeLocation: 'KOZHIKODE',
    dailyRate: 9000,
  },
  { tag: 'fx3', name: 'Sony FX3', category: 'CAMERA', homeLocation: 'KOZHIKODE', dailyRate: 5000 },
  {
    tag: 'komodo',
    name: 'RED Komodo 6K',
    category: 'CAMERA',
    homeLocation: 'KOZHIKODE',
    dailyRate: 12000,
    maintenance: true,
  },
  {
    tag: 'fx6-c',
    name: 'Sony FX6 — Chennai',
    category: 'CAMERA',
    homeLocation: 'CHENNAI',
    dailyRate: 9000,
  },
  {
    tag: 'bmpcc',
    name: 'Blackmagic Pocket 6K Pro',
    category: 'CAMERA',
    homeLocation: 'CHENNAI',
    dailyRate: 4500,
  },
  {
    tag: 'sigma',
    name: 'Sigma Cine 18–35 T2',
    category: 'LENS',
    homeLocation: 'KOZHIKODE',
    dailyRate: 2500,
  },
  {
    tag: 'gm2470',
    name: 'Sony 24–70 GM II',
    category: 'LENS',
    homeLocation: 'KOZHIKODE',
    dailyRate: 2000,
  },
  {
    tag: 'macro',
    name: 'Laowa 100mm Macro',
    category: 'LENS',
    homeLocation: 'KOZHIKODE',
    dailyRate: 1500,
  },
  {
    tag: 'gm70200',
    name: 'Sony 70–200 GM II',
    category: 'LENS',
    homeLocation: 'CHENNAI',
    dailyRate: 2500,
  },
  {
    tag: 'vespid',
    name: 'DZOFilm Vespid prime set',
    category: 'LENS',
    homeLocation: 'CHENNAI',
    dailyRate: 6000,
  },
  {
    tag: '600d',
    name: 'Aputure LS 600d',
    category: 'LIGHTING',
    homeLocation: 'KOZHIKODE',
    dailyRate: 3500,
  },
  {
    tag: '300x',
    name: 'Aputure LS 300x',
    category: 'LIGHTING',
    homeLocation: 'KOZHIKODE',
    dailyRate: 2500,
  },
  {
    tag: 'pavotube',
    name: 'Nanlite PavoTube II kit',
    category: 'LIGHTING',
    homeLocation: 'CHENNAI',
    dailyRate: 3000,
  },
  {
    tag: 'amaran',
    name: 'Amaran 200x S',
    category: 'LIGHTING',
    homeLocation: 'CHENNAI',
    dailyRate: 1500,
  },
  {
    tag: 'mkh416',
    name: 'Sennheiser MKH 416 boom kit',
    category: 'AUDIO',
    homeLocation: 'KOZHIKODE',
    dailyRate: 1500,
  },
  {
    tag: 'rodewl',
    name: 'RØDE Wireless PRO kit',
    category: 'AUDIO',
    homeLocation: 'KOZHIKODE',
    dailyRate: 1200,
  },
  {
    tag: 'zoomf6',
    name: 'Zoom F6 recorder',
    category: 'AUDIO',
    homeLocation: 'CHENNAI',
    dailyRate: 1200,
  },
  {
    tag: 'rs4',
    name: 'DJI RS 4 Pro gimbal',
    category: 'GRIP',
    homeLocation: 'KOZHIKODE',
    dailyRate: 2000,
  },
  {
    tag: 'sachtler',
    name: 'Sachtler flowtech tripod',
    category: 'GRIP',
    homeLocation: 'CHENNAI',
    dailyRate: 1000,
  },
  {
    tag: 'inspire3',
    name: 'DJI Inspire 3',
    category: 'DRONE',
    homeLocation: 'KOZHIKODE',
    dailyRate: 15000,
  },
  {
    tag: 'mavic3',
    name: 'DJI Mavic 3 Cine',
    category: 'DRONE',
    homeLocation: 'CHENNAI',
    dailyRate: 6000,
  },
  {
    tag: 'suite1',
    name: 'Edit suite 1 — Resolve grading',
    category: 'COMPUTE',
    homeLocation: 'KOZHIKODE',
    dailyRate: 4000,
  },
  {
    tag: 'suite2',
    name: 'Edit suite 2 — Premiere',
    category: 'COMPUTE',
    homeLocation: 'CHENNAI',
    dailyRate: 3000,
  },
];

// ─── Shoots ───────────────────────────────────────────────────────────────────

export const SHOOTS: {
  project: string;
  title: string;
  location: string;
  city: StudioLocation;
  dayOffset: number;
  days: number;
  startHour: number;
  endHour: number;
  callTime: string;
  crew: { role: RoleTag; as: string }[];
  assets: string[];
}[] = [
  {
    project: 'zenpods-hero',
    title: 'Macro product day',
    location: 'Studio floor, HiLITE Business Park',
    city: 'KOZHIKODE',
    dayOffset: -15,
    days: 1,
    startHour: 8,
    endHour: 19,
    callTime: '07:30',
    crew: [
      { role: 'director', as: 'Director' },
      { role: 'dop', as: 'DOP' },
      { role: 'camera', as: 'Camera assistant' },
    ],
    assets: ['fx6-a', 'macro', '600d', '300x'],
  },
  {
    project: 'aurora-film',
    title: 'Weavers’ village — principal',
    location: 'Handloom weaving unit, Chaliyam (demo)',
    city: 'KOZHIKODE',
    dayOffset: -12,
    days: 2,
    startHour: 6,
    endHour: 18,
    callTime: '05:30',
    crew: [
      { role: 'director', as: 'Director' },
      { role: 'dop', as: 'DOP' },
      { role: 'camera', as: 'B-cam / gimbal' },
      { role: 'sound', as: 'Location sound' },
    ],
    assets: ['fx6-a', 'fx6-b', 'sigma', 'rs4', 'mkh416'],
  },
  {
    project: 'carefirst-ad',
    title: 'Hospital night shift',
    location: 'CareFirst Clinic, Mavoor Road (demo)',
    city: 'KOZHIKODE',
    dayOffset: 0,
    days: 1,
    startHour: 14,
    endHour: 23,
    callTime: '13:00',
    crew: [
      { role: 'director', as: 'Director' },
      { role: 'dop', as: 'DOP' },
      { role: 'sound', as: 'Location sound' },
    ],
    assets: ['fx6-b', 'gm2470', 'rodewl', '300x'],
  },
  {
    project: 'neotech-corp',
    title: 'Office and interviews',
    location: 'NeoTech campus, OMR (demo)',
    city: 'CHENNAI',
    dayOffset: 1,
    days: 2,
    startHour: 9,
    endHour: 18,
    callTime: '08:30',
    crew: [
      { role: 'director', as: 'Director' },
      { role: 'producer', as: 'Producer' },
      { role: 'coordinator', as: 'Coordinator' },
    ],
    assets: ['fx6-c', 'vespid', 'pavotube', 'zoomf6', 'sachtler'],
  },
  {
    project: 'malabar-skyline',
    title: 'Aerial and golden hour',
    location: 'Riverside site, Kallai (demo)',
    city: 'KOZHIKODE',
    dayOffset: 3,
    days: 1,
    startHour: 6,
    endHour: 18,
    callTime: '05:15',
    crew: [
      { role: 'dop', as: 'DOP' },
      { role: 'camera', as: 'Drone pilot' },
    ],
    assets: ['inspire3', 'fx6-a', 'sigma'],
  },
  {
    project: 'vibe-reels',
    title: 'Beach reels',
    location: 'Kozhikode Beach (demo)',
    city: 'KOZHIKODE',
    dayOffset: 3,
    days: 1,
    startHour: 10,
    endHour: 16,
    callTime: '09:30',
    crew: [
      { role: 'director', as: 'Director' },
      { role: 'editor', as: 'On-set editor' },
    ],
    assets: ['fx6-a', 'rs4', 'rodewl'],
  },
  {
    project: 'brightpath-stories',
    title: 'Campus stories — three-day block',
    location: 'BrightPath campus, Adyar (demo)',
    city: 'CHENNAI',
    dayOffset: 7,
    days: 3,
    startHour: 9,
    endHour: 15,
    callTime: '08:30',
    crew: [
      { role: 'producer', as: 'Producer' },
      { role: 'editor', as: 'Second camera' },
    ],
    assets: ['bmpcc', 'gm70200', 'amaran', 'zoomf6'],
  },
  {
    project: 'coastline-ad',
    title: 'Location recce',
    location: 'Coastline resort, Kappad (demo)',
    city: 'KOZHIKODE',
    dayOffset: 10,
    days: 1,
    startHour: 9,
    endHour: 17,
    callTime: '08:30',
    crew: [
      { role: 'director', as: 'Director' },
      { role: 'dop', as: 'DOP' },
      { role: 'coordinator', as: 'Coordinator' },
    ],
    assets: ['fx3'],
  },
];

// ─── Sales ────────────────────────────────────────────────────────────────────

export const LEADS: {
  title: string;
  client?: ClientTag;
  prospectName?: string;
  projectType: ProjectType;
  estimatedValue: number;
  stage: LeadStage;
  source: LeadSource;
  closeOffset: number;
}[] = [
  {
    title: 'Monsoon collection campaign',
    client: 'aurora',
    projectType: 'CAMPAIGN',
    estimatedValue: 420000,
    stage: 'PROPOSAL',
    source: 'REFERRAL',
    closeOffset: 12,
  },
  {
    title: 'Annual day event coverage',
    client: 'brightpath',
    projectType: 'EVENT_COVERAGE',
    estimatedValue: 150000,
    stage: 'NEGOTIATION',
    source: 'WHATSAPP',
    closeOffset: 6,
  },
  {
    title: 'Founder story brand film',
    prospectName: 'Kettle & Co. Tea (demo)',
    projectType: 'BRAND_FILM',
    estimatedValue: 600000,
    stage: 'DISCOVERY',
    source: 'INSTAGRAM',
    closeOffset: 25,
  },
  {
    title: 'Podcast studio setup and season 1',
    prospectName: 'Malabar Founders Circle (demo)',
    projectType: 'PODCAST',
    estimatedValue: 280000,
    stage: 'INQUIRY',
    source: 'WEBSITE',
    closeOffset: 40,
  },
  {
    title: 'Green-screen product explainers',
    client: 'neotech',
    projectType: 'STUDIO_GREEN_SCREEN',
    estimatedValue: 240000,
    stage: 'PROPOSAL',
    source: 'LINKEDIN',
    closeOffset: 15,
  },
  {
    title: 'Resort aerial showcase',
    client: 'coastline',
    projectType: 'AERIAL',
    estimatedValue: 190000,
    stage: 'NEGOTIATION',
    source: 'REFERRAL',
    closeOffset: 4,
  },
  {
    title: 'Clinic explainer series',
    client: 'carefirst',
    projectType: 'EXPLAINER',
    estimatedValue: 210000,
    stage: 'DISCOVERY',
    source: 'WEBSITE',
    closeOffset: 30,
  },
  {
    title: 'Launch film for EV scooter',
    prospectName: 'Volt Riders (demo)',
    projectType: 'PRODUCT_VIDEO',
    estimatedValue: 520000,
    stage: 'INQUIRY',
    source: 'WEBSITE',
    closeOffset: 45,
  },
  {
    title: 'Summer reels',
    client: 'vibe',
    projectType: 'SOCIAL_REEL',
    estimatedValue: 180000,
    stage: 'WON',
    source: 'INSTAGRAM',
    closeOffset: -6,
  },
  {
    title: 'Hotel rebrand film',
    prospectName: 'Hilltop Stays (demo)',
    projectType: 'BRAND_FILM',
    estimatedValue: 450000,
    stage: 'LOST',
    source: 'LINKEDIN',
    closeOffset: -9,
  },
];

export const MONTHLY_OVERHEADS: {
  category: 'SOFTWARE' | 'MARKETING' | 'OVERHEAD';
  amount: number;
  note: string;
}[] = [
  { category: 'SOFTWARE', amount: 28000, note: 'Editing, grading and AI tool subscriptions' },
  { category: 'MARKETING', amount: 35000, note: 'Social promotion and showreel' },
  { category: 'OVERHEAD', amount: 95000, note: 'Studio rent, utilities and insurance' },
];
