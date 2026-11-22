// Generated once from the former Prisma schema; now maintained by hand.
import { Schema } from 'mongoose';
import {
  StudioLocation,
  ClientStatus,
  InteractionType,
  LeadStage,
  LeadSource,
  StageKey,
  ProjectType,
  ProjectStatus,
  Priority,
  StageStatus,
  TransitionDirection,
  ActivitySource,
  TaskStatus,
  DeliverableStatus,
  FeedbackStatus,
  ApprovalKind,
  ApprovalStatus,
  ShootStatus,
  AssetCategory,
  AssetStatus,
  AssetCondition,
  MaintenanceKind,
  FinanceKind,
  FinanceCategory,
  AssistantRole,
  AssistantActionStatus,
  RiskLevel,
  RiskStatus,
  EmploymentType,
  LeaveType,
  LeaveStatus,
  AttendanceStatus,
  VendorCategory,
  ApprovalSubject,
  ApprovalRequestStatus,
  ApprovalStepStatus,
  ExpenseStatus,
  InvoiceStatus,
  PaymentMethod,
  PurchaseRequestStatus,
  PurchaseOrderStatus,
  StockCategory,
  StockMovementType,
  StudioBookingStatus,
  DocumentCategory,
} from './enums';
import { baseSchemaOptions, newId, touchUpdatedAt } from './plugins';
import type * as T from './types';

export const UserSchema = (() => {
  const schema = new Schema<T.User>(
    {
      _id: { type: String, default: newId },
      email: { type: String, required: true },
      passwordHash: { type: String, required: true },
      name: { type: String, required: true },
      avatarUrl: { type: String, default: null },
      isActive: { type: Boolean, default: true },
      lastLoginAt: { type: Date, default: null },
      roleId: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('users'),
  );
  touchUpdatedAt(schema);
  schema.index({ email: 1 }, { unique: true });
  schema.index({ roleId: 1 });
  schema.virtual('role', { ref: 'Role', localField: 'roleId', foreignField: '_id', justOne: true });
  schema.virtual('sessions', {
    ref: 'Session',
    localField: '_id',
    foreignField: 'userId',
    justOne: false,
  });
  schema.virtual('teamMember', {
    ref: 'TeamMember',
    localField: '_id',
    foreignField: 'userId',
    justOne: true,
  });
  schema.virtual('activities', {
    ref: 'ActivityLog',
    localField: '_id',
    foreignField: 'actorId',
    justOne: false,
  });
  schema.virtual('notifications', {
    ref: 'Notification',
    localField: '_id',
    foreignField: 'userId',
    justOne: false,
  });
  schema.virtual('assistantMessages', {
    ref: 'AssistantInteraction',
    localField: '_id',
    foreignField: 'userId',
    justOne: false,
  });
  schema.virtual('stageTransitions', {
    ref: 'StageTransition',
    localField: '_id',
    foreignField: 'actorId',
    justOne: false,
  });
  schema.virtual('interactionsLogged', {
    ref: 'ClientInteraction',
    localField: '_id',
    foreignField: 'loggedById',
    justOne: false,
  });
  schema.virtual('notificationPrefs', {
    ref: 'NotificationPreference',
    localField: '_id',
    foreignField: 'userId',
    justOne: false,
  });
  schema.virtual('approvalsRequested', {
    ref: 'ApprovalRequest',
    localField: '_id',
    foreignField: 'requestedById',
    justOne: false,
  });
  schema.virtual('approvalDecisions', {
    ref: 'ApprovalStep',
    localField: '_id',
    foreignField: 'deciderId',
    justOne: false,
  });
  schema.virtual('expensesSubmitted', {
    ref: 'Expense',
    localField: '_id',
    foreignField: 'submittedById',
    justOne: false,
  });
  schema.virtual('invoicesCreated', {
    ref: 'Invoice',
    localField: '_id',
    foreignField: 'createdById',
    justOne: false,
  });
  schema.virtual('paymentsRecorded', {
    ref: 'Payment',
    localField: '_id',
    foreignField: 'recordedById',
    justOne: false,
  });
  schema.virtual('purchaseRequests', {
    ref: 'PurchaseRequest',
    localField: '_id',
    foreignField: 'requestedById',
    justOne: false,
  });
  schema.virtual('purchaseOrders', {
    ref: 'PurchaseOrder',
    localField: '_id',
    foreignField: 'createdById',
    justOne: false,
  });
  schema.virtual('stockMovements', {
    ref: 'StockMovement',
    localField: '_id',
    foreignField: 'actorId',
    justOne: false,
  });
  schema.virtual('studioBookings', {
    ref: 'StudioBooking',
    localField: '_id',
    foreignField: 'bookedById',
    justOne: false,
  });
  schema.virtual('documentsCreated', {
    ref: 'Document',
    localField: '_id',
    foreignField: 'createdById',
    justOne: false,
  });
  schema.virtual('documentVersions', {
    ref: 'DocumentVersion',
    localField: '_id',
    foreignField: 'uploadedById',
    justOne: false,
  });
  schema.virtual('leadsOwned', {
    ref: 'Lead',
    localField: '_id',
    foreignField: 'ownerId',
    justOne: false,
  });
  return schema;
})();

export const SessionSchema = (() => {
  const schema = new Schema<T.Session>(
    {
      _id: { type: String, default: newId },
      tokenHash: { type: String, required: true },
      userId: { type: String, required: true },
      expiresAt: { type: Date, required: true },
      lastSeenAt: { type: Date, default: Date.now },
      ip: { type: String, default: null },
      userAgent: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('sessions'),
  );
  schema.index({ tokenHash: 1 }, { unique: true });
  schema.index({ userId: 1 });
  schema.virtual('user', { ref: 'User', localField: 'userId', foreignField: '_id', justOne: true });
  return schema;
})();

export const RoleSchema = (() => {
  const schema = new Schema<T.Role>(
    {
      _id: { type: String, default: newId },
      key: { type: String, required: true },
      name: { type: String, required: true },
      description: { type: String, default: null },
      isSystem: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('roles'),
  );
  schema.index({ key: 1 }, { unique: true });
  schema.virtual('users', {
    ref: 'User',
    localField: '_id',
    foreignField: 'roleId',
    justOne: false,
  });
  schema.virtual('permissions', {
    ref: 'RolePermission',
    localField: '_id',
    foreignField: 'roleId',
    justOne: false,
  });
  return schema;
})();

export const PermissionSchema = (() => {
  const schema = new Schema<T.Permission>(
    {
      _id: { type: String, default: newId },
      key: { type: String, required: true },
    },
    baseSchemaOptions('permissions'),
  );
  schema.index({ key: 1 }, { unique: true });
  schema.virtual('roles', {
    ref: 'RolePermission',
    localField: '_id',
    foreignField: 'permissionId',
    justOne: false,
  });
  return schema;
})();

export const RolePermissionSchema = (() => {
  const schema = new Schema<T.RolePermission>(
    {
      _id: { type: String, default: newId },
      roleId: { type: String, required: true },
      permissionId: { type: String, required: true },
    },
    baseSchemaOptions('rolePermissions'),
  );
  schema.index({ roleId: 1, permissionId: 1 }, { unique: true });
  schema.index({ permissionId: 1 });
  schema.virtual('role', { ref: 'Role', localField: 'roleId', foreignField: '_id', justOne: true });
  schema.virtual('permission', {
    ref: 'Permission',
    localField: 'permissionId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const TeamMemberSchema = (() => {
  const schema = new Schema<T.TeamMember>(
    {
      _id: { type: String, default: newId },
      name: { type: String, required: true },
      title: { type: String, required: true },
      skills: { type: [String], default: [] },
      baseLocation: { type: String, enum: Object.values(StudioLocation), required: true },
      weeklyCapacityHours: { type: Number, validate: Number.isInteger, default: 40 },
      avatarUrl: { type: String, default: null },
      email: { type: String, default: null },
      isActive: { type: Boolean, default: true },
      userId: { type: String, default: null },
      departmentId: { type: String, default: null },
      employmentType: { type: String, enum: Object.values(EmploymentType), default: 'FULL_TIME' },
      joinedOn: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('teamMembers'),
  );
  schema.index(
    { userId: 1 },
    { unique: true, partialFilterExpression: { userId: { $type: 'string' } } },
  );
  schema.index({ departmentId: 1 });
  schema.virtual('user', { ref: 'User', localField: 'userId', foreignField: '_id', justOne: true });
  schema.virtual('department', {
    ref: 'Department',
    localField: 'departmentId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('tasks', {
    ref: 'Task',
    localField: '_id',
    foreignField: 'assigneeId',
    justOne: false,
  });
  schema.virtual('projectRoles', {
    ref: 'ProjectMember',
    localField: '_id',
    foreignField: 'teamMemberId',
    justOne: false,
  });
  schema.virtual('crewCalls', {
    ref: 'CrewCall',
    localField: '_id',
    foreignField: 'teamMemberId',
    justOne: false,
  });
  schema.virtual('stagesOwned', {
    ref: 'ProjectStage',
    localField: '_id',
    foreignField: 'ownerId',
    justOne: false,
  });
  schema.virtual('record', {
    ref: 'EmployeeRecord',
    localField: '_id',
    foreignField: 'teamMemberId',
    justOne: true,
  });
  schema.virtual('leaveRequests', {
    ref: 'LeaveRequest',
    localField: '_id',
    foreignField: 'teamMemberId',
    justOne: false,
  });
  schema.virtual('attendance', {
    ref: 'AttendanceRecord',
    localField: '_id',
    foreignField: 'teamMemberId',
    justOne: false,
  });
  schema.virtual('departmentsLed', {
    ref: 'Department',
    localField: '_id',
    foreignField: 'leadId',
    justOne: false,
  });
  schema.virtual('assetsInCustody', {
    ref: 'Asset',
    localField: '_id',
    foreignField: 'custodianId',
    justOne: false,
  });
  schema.virtual('risksOwned', {
    ref: 'ProjectRisk',
    localField: '_id',
    foreignField: 'ownerId',
    justOne: false,
  });
  schema.virtual('documents', {
    ref: 'Document',
    localField: '_id',
    foreignField: 'teamMemberId',
    justOne: false,
  });
  return schema;
})();

export const ProjectMemberSchema = (() => {
  const schema = new Schema<T.ProjectMember>(
    {
      _id: { type: String, default: newId },
      projectId: { type: String, required: true },
      teamMemberId: { type: String, required: true },
      role: { type: String, required: true },
    },
    baseSchemaOptions('projectMembers'),
  );
  schema.index({ projectId: 1, teamMemberId: 1 }, { unique: true });
  schema.index({ teamMemberId: 1 });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('teamMember', {
    ref: 'TeamMember',
    localField: 'teamMemberId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const ClientSchema = (() => {
  const schema = new Schema<T.Client>(
    {
      _id: { type: String, default: newId },
      name: { type: String, required: true },
      industry: { type: String, required: true },
      city: { type: String, required: true },
      status: { type: String, enum: Object.values(ClientStatus), default: 'ACTIVE' },
      contactName: { type: String, default: null },
      contactEmail: { type: String, default: null },
      contactPhone: { type: String, default: null },
      accentColor: { type: String, default: null },
      notes: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('clients'),
  );
  touchUpdatedAt(schema);
  schema.virtual('projects', {
    ref: 'Project',
    localField: '_id',
    foreignField: 'clientId',
    justOne: false,
  });
  schema.virtual('interactions', {
    ref: 'ClientInteraction',
    localField: '_id',
    foreignField: 'clientId',
    justOne: false,
  });
  schema.virtual('leads', {
    ref: 'Lead',
    localField: '_id',
    foreignField: 'clientId',
    justOne: false,
  });
  schema.virtual('contacts', {
    ref: 'ClientContact',
    localField: '_id',
    foreignField: 'clientId',
    justOne: false,
  });
  schema.virtual('invoices', {
    ref: 'Invoice',
    localField: '_id',
    foreignField: 'clientId',
    justOne: false,
  });
  schema.virtual('documents', {
    ref: 'Document',
    localField: '_id',
    foreignField: 'clientId',
    justOne: false,
  });
  return schema;
})();

export const ClientContactSchema = (() => {
  const schema = new Schema<T.ClientContact>(
    {
      _id: { type: String, default: newId },
      clientId: { type: String, required: true },
      name: { type: String, required: true },
      role: { type: String, default: null },
      email: { type: String, default: null },
      phone: { type: String, default: null },
      isPrimary: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('clientContacts'),
  );
  schema.index({ clientId: 1 });
  schema.virtual('client', {
    ref: 'Client',
    localField: 'clientId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const ClientInteractionSchema = (() => {
  const schema = new Schema<T.ClientInteraction>(
    {
      _id: { type: String, default: newId },
      clientId: { type: String, required: true },
      projectId: { type: String, default: null },
      type: { type: String, enum: Object.values(InteractionType), required: true },
      summary: { type: String, required: true },
      occurredAt: { type: Date, required: true },
      loggedById: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('clientInteractions'),
  );
  schema.index({ clientId: 1, occurredAt: 1 });
  schema.index({ projectId: 1 });
  schema.index({ loggedById: 1 });
  schema.virtual('client', {
    ref: 'Client',
    localField: 'clientId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('loggedBy', {
    ref: 'User',
    localField: 'loggedById',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const LeadSchema = (() => {
  const schema = new Schema<T.Lead>(
    {
      _id: { type: String, default: newId },
      title: { type: String, required: true },
      clientId: { type: String, default: null },
      prospectName: { type: String, default: null },
      projectType: { type: String, enum: Object.values(ProjectType), required: true },
      estimatedValue: { type: Number, validate: Number.isInteger, required: true },
      stage: { type: String, enum: Object.values(LeadStage), default: 'INQUIRY' },
      source: { type: String, enum: Object.values(LeadSource), required: true },
      expectedCloseDate: { type: Date, default: null },
      notes: { type: String, default: null },
      convertedProjectId: { type: String, default: null },
      ownerId: { type: String, default: null },
      nextFollowUpAt: { type: Date, default: null },
      lostReason: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('leads'),
  );
  touchUpdatedAt(schema);
  schema.index(
    { convertedProjectId: 1 },
    { unique: true, partialFilterExpression: { convertedProjectId: { $type: 'string' } } },
  );
  schema.index({ stage: 1 });
  schema.index({ nextFollowUpAt: 1 });
  schema.index({ clientId: 1 });
  schema.index({ ownerId: 1 });
  schema.virtual('client', {
    ref: 'Client',
    localField: 'clientId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('convertedProject', {
    ref: 'Project',
    localField: 'convertedProjectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('owner', {
    ref: 'User',
    localField: 'ownerId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('documents', {
    ref: 'Document',
    localField: '_id',
    foreignField: 'leadId',
    justOne: false,
  });
  return schema;
})();

export const WorkflowTemplateSchema = (() => {
  const schema = new Schema<T.WorkflowTemplate>(
    {
      _id: { type: String, default: newId },
      name: { type: String, required: true },
      description: { type: String, default: null },
      isDefault: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('workflowTemplates'),
  );
  touchUpdatedAt(schema);
  schema.index({ name: 1 }, { unique: true });
  schema.virtual('stages', {
    ref: 'StageDefinition',
    localField: '_id',
    foreignField: 'templateId',
    justOne: false,
  });
  schema.virtual('projects', {
    ref: 'Project',
    localField: '_id',
    foreignField: 'workflowTemplateId',
    justOne: false,
  });
  return schema;
})();

export const StageDefinitionSchema = (() => {
  const schema = new Schema<T.StageDefinition>(
    {
      _id: { type: String, default: newId },
      templateId: { type: String, required: true },
      key: { type: String, enum: Object.values(StageKey), required: true },
      label: { type: String, required: true },
      order: { type: Number, validate: Number.isInteger, required: true },
      expectedDays: { type: Number, validate: Number.isInteger, required: true },
      requiresApproval: { type: Boolean, default: false },
      skippable: { type: Boolean, default: false },
      exitCriteria: { type: [String], default: [] },
    },
    baseSchemaOptions('stageDefinitions'),
  );
  schema.index({ templateId: 1, key: 1 }, { unique: true });
  schema.index({ templateId: 1, order: 1 }, { unique: true });
  schema.virtual('template', {
    ref: 'WorkflowTemplate',
    localField: 'templateId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('projectStages', {
    ref: 'ProjectStage',
    localField: '_id',
    foreignField: 'stageDefinitionId',
    justOne: false,
  });
  return schema;
})();

export const ProjectSchema = (() => {
  const schema = new Schema<T.Project>(
    {
      _id: { type: String, default: newId },
      code: { type: String, required: true },
      title: { type: String, required: true },
      logline: { type: String, default: null },
      clientId: { type: String, required: true },
      type: { type: String, enum: Object.values(ProjectType), required: true },
      workflowTemplateId: { type: String, required: true },
      status: { type: String, enum: Object.values(ProjectStatus), default: 'ACTIVE' },
      priority: { type: String, enum: Object.values(Priority), default: 'MEDIUM' },
      location: { type: String, enum: Object.values(StudioLocation), required: true },
      startDate: { type: Date, required: true },
      dueDate: { type: Date, required: true },
      deliveredAt: { type: Date, default: null },
      budget: { type: Number, validate: Number.isInteger, required: true },
      includedRevisions: { type: Number, validate: Number.isInteger, default: 2 },
      coverImageUrl: { type: String, default: null },
      aiAssisted: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('projects'),
  );
  touchUpdatedAt(schema);
  schema.index({ code: 1 }, { unique: true });
  schema.index({ status: 1, dueDate: 1 });
  schema.index({ clientId: 1 });
  schema.index({ workflowTemplateId: 1 });
  schema.virtual('client', {
    ref: 'Client',
    localField: 'clientId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('workflowTemplate', {
    ref: 'WorkflowTemplate',
    localField: 'workflowTemplateId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('stages', {
    ref: 'ProjectStage',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('transitions', {
    ref: 'StageTransition',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('tasks', {
    ref: 'Task',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('members', {
    ref: 'ProjectMember',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('deliverables', {
    ref: 'Deliverable',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('shoots', {
    ref: 'Shoot',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('finances', {
    ref: 'FinancialRecord',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('interactions', {
    ref: 'ClientInteraction',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('bookings', {
    ref: 'AssetBooking',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('lead', {
    ref: 'Lead',
    localField: '_id',
    foreignField: 'convertedProjectId',
    justOne: true,
  });
  schema.virtual('milestones', {
    ref: 'Milestone',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('risks', {
    ref: 'ProjectRisk',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('expenses', {
    ref: 'Expense',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('invoices', {
    ref: 'Invoice',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('purchaseRequests', {
    ref: 'PurchaseRequest',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('stockMovements', {
    ref: 'StockMovement',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('studioBookings', {
    ref: 'StudioBooking',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('documents', {
    ref: 'Document',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  schema.virtual('approvalRequests', {
    ref: 'ApprovalRequest',
    localField: '_id',
    foreignField: 'projectId',
    justOne: false,
  });
  return schema;
})();

export const ProjectStageSchema = (() => {
  const schema = new Schema<T.ProjectStage>(
    {
      _id: { type: String, default: newId },
      projectId: { type: String, required: true },
      stageDefinitionId: { type: String, required: true },
      status: { type: String, enum: Object.values(StageStatus), default: 'PENDING' },
      ownerId: { type: String, default: null },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
    },
    baseSchemaOptions('projectStages'),
  );
  schema.index({ projectId: 1, stageDefinitionId: 1 }, { unique: true });
  schema.index({ status: 1 });
  schema.index({ stageDefinitionId: 1 });
  schema.index({ ownerId: 1 });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('stageDefinition', {
    ref: 'StageDefinition',
    localField: 'stageDefinitionId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('owner', {
    ref: 'TeamMember',
    localField: 'ownerId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('tasks', {
    ref: 'Task',
    localField: '_id',
    foreignField: 'projectStageId',
    justOne: false,
  });
  schema.virtual('approvals', {
    ref: 'Approval',
    localField: '_id',
    foreignField: 'projectStageId',
    justOne: false,
  });
  schema.virtual('transitionsFrom', {
    ref: 'StageTransition',
    localField: '_id',
    foreignField: 'fromStageId',
    justOne: false,
  });
  schema.virtual('transitionsTo', {
    ref: 'StageTransition',
    localField: '_id',
    foreignField: 'toStageId',
    justOne: false,
  });
  return schema;
})();

export const StageTransitionSchema = (() => {
  const schema = new Schema<T.StageTransition>(
    {
      _id: { type: String, default: newId },
      projectId: { type: String, required: true },
      fromStageId: { type: String, default: null },
      toStageId: { type: String, default: null },
      direction: { type: String, enum: Object.values(TransitionDirection), required: true },
      reason: { type: String, default: null },
      actorId: { type: String, default: null },
      source: { type: String, enum: Object.values(ActivitySource), default: 'UI' },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('stageTransitions'),
  );
  schema.index({ projectId: 1, createdAt: 1 });
  schema.index({ fromStageId: 1 });
  schema.index({ toStageId: 1 });
  schema.index({ actorId: 1 });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('fromStage', {
    ref: 'ProjectStage',
    localField: 'fromStageId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('toStage', {
    ref: 'ProjectStage',
    localField: 'toStageId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('actor', {
    ref: 'User',
    localField: 'actorId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const TaskSchema = (() => {
  const schema = new Schema<T.Task>(
    {
      _id: { type: String, default: newId },
      projectId: { type: String, required: true },
      projectStageId: { type: String, default: null },
      title: { type: String, required: true },
      description: { type: String, default: null },
      assigneeId: { type: String, default: null },
      status: { type: String, enum: Object.values(TaskStatus), default: 'TODO' },
      priority: { type: String, enum: Object.values(Priority), default: 'MEDIUM' },
      dueDate: { type: Date, default: null },
      estimateHours: { type: Number, validate: Number.isInteger, default: null },
      isStageBlocking: { type: Boolean, default: false },
      blockedReason: { type: String, default: null },
      completedAt: { type: Date, default: null },
      parentId: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('tasks'),
  );
  touchUpdatedAt(schema);
  schema.index({ projectId: 1, status: 1 });
  schema.index({ assigneeId: 1, status: 1 });
  schema.index({ projectStageId: 1 });
  schema.index({ parentId: 1 });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('projectStage', {
    ref: 'ProjectStage',
    localField: 'projectStageId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('assignee', {
    ref: 'TeamMember',
    localField: 'assigneeId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('parent', {
    ref: 'Task',
    localField: 'parentId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('subtasks', {
    ref: 'Task',
    localField: '_id',
    foreignField: 'parentId',
    justOne: false,
  });
  schema.virtual('dependsOn', {
    ref: 'TaskDependency',
    localField: '_id',
    foreignField: 'taskId',
    justOne: false,
  });
  schema.virtual('dependents', {
    ref: 'TaskDependency',
    localField: '_id',
    foreignField: 'dependsOnId',
    justOne: false,
  });
  return schema;
})();

export const TaskDependencySchema = (() => {
  const schema = new Schema<T.TaskDependency>(
    {
      _id: { type: String, default: newId },
      taskId: { type: String, required: true },
      dependsOnId: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('taskDependencies'),
  );
  schema.index({ taskId: 1, dependsOnId: 1 }, { unique: true });
  schema.index({ dependsOnId: 1 });
  schema.virtual('task', { ref: 'Task', localField: 'taskId', foreignField: '_id', justOne: true });
  schema.virtual('dependsOn', {
    ref: 'Task',
    localField: 'dependsOnId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const DeliverableSchema = (() => {
  const schema = new Schema<T.Deliverable>(
    {
      _id: { type: String, default: newId },
      projectId: { type: String, required: true },
      name: { type: String, required: true },
      format: { type: String, required: true },
      aspectRatio: { type: String, required: true },
      durationSec: { type: Number, validate: Number.isInteger, default: null },
      status: { type: String, enum: Object.values(DeliverableStatus), default: 'PLANNED' },
      currentVersion: { type: Number, validate: Number.isInteger, default: 0 },
      dueDate: { type: Date, default: null },
      previewImageUrl: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('deliverables'),
  );
  touchUpdatedAt(schema);
  schema.index({ projectId: 1, status: 1 });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('rounds', {
    ref: 'RevisionRound',
    localField: '_id',
    foreignField: 'deliverableId',
    justOne: false,
  });
  schema.virtual('approvals', {
    ref: 'Approval',
    localField: '_id',
    foreignField: 'deliverableId',
    justOne: false,
  });
  return schema;
})();

export const RevisionRoundSchema = (() => {
  const schema = new Schema<T.RevisionRound>(
    {
      _id: { type: String, default: newId },
      deliverableId: { type: String, required: true },
      number: { type: Number, validate: Number.isInteger, required: true },
      sentAt: { type: Date, required: true },
      closedAt: { type: Date, default: null },
      includedInScope: { type: Boolean, default: true },
    },
    baseSchemaOptions('revisionRounds'),
  );
  schema.index({ deliverableId: 1, number: 1 }, { unique: true });
  schema.virtual('deliverable', {
    ref: 'Deliverable',
    localField: 'deliverableId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('feedback', {
    ref: 'FeedbackItem',
    localField: '_id',
    foreignField: 'revisionRoundId',
    justOne: false,
  });
  return schema;
})();

export const FeedbackItemSchema = (() => {
  const schema = new Schema<T.FeedbackItem>(
    {
      _id: { type: String, default: newId },
      revisionRoundId: { type: String, required: true },
      timecode: { type: String, default: null },
      body: { type: String, required: true },
      author: { type: String, required: true },
      status: { type: String, enum: Object.values(FeedbackStatus), default: 'OPEN' },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('feedbackItems'),
  );
  schema.index({ revisionRoundId: 1 });
  schema.virtual('revisionRound', {
    ref: 'RevisionRound',
    localField: 'revisionRoundId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const ApprovalSchema = (() => {
  const schema = new Schema<T.Approval>(
    {
      _id: { type: String, default: newId },
      kind: { type: String, enum: Object.values(ApprovalKind), required: true },
      status: { type: String, enum: Object.values(ApprovalStatus), default: 'PENDING' },
      deliverableId: { type: String, default: null },
      projectStageId: { type: String, default: null },
      title: { type: String, required: true },
      requestedAt: { type: Date, default: Date.now },
      decidedAt: { type: Date, default: null },
      decidedBy: { type: String, default: null },
      note: { type: String, default: null },
    },
    baseSchemaOptions('approvals'),
  );
  schema.index({ status: 1, requestedAt: 1 });
  schema.index({ deliverableId: 1 });
  schema.index({ projectStageId: 1 });
  schema.virtual('deliverable', {
    ref: 'Deliverable',
    localField: 'deliverableId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('projectStage', {
    ref: 'ProjectStage',
    localField: 'projectStageId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const ShootSchema = (() => {
  const schema = new Schema<T.Shoot>(
    {
      _id: { type: String, default: newId },
      projectId: { type: String, required: true },
      title: { type: String, required: true },
      location: { type: String, required: true },
      city: { type: String, enum: Object.values(StudioLocation), required: true },
      startsAt: { type: Date, required: true },
      endsAt: { type: Date, required: true },
      callTime: { type: String, default: null },
      status: { type: String, enum: Object.values(ShootStatus), default: 'PLANNED' },
      notes: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('shoots'),
  );
  touchUpdatedAt(schema);
  schema.index({ startsAt: 1 });
  schema.index({ projectId: 1 });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('crew', {
    ref: 'CrewCall',
    localField: '_id',
    foreignField: 'shootId',
    justOne: false,
  });
  schema.virtual('bookings', {
    ref: 'AssetBooking',
    localField: '_id',
    foreignField: 'shootId',
    justOne: false,
  });
  schema.virtual('studioBookings', {
    ref: 'StudioBooking',
    localField: '_id',
    foreignField: 'shootId',
    justOne: false,
  });
  return schema;
})();

export const CrewCallSchema = (() => {
  const schema = new Schema<T.CrewCall>(
    {
      _id: { type: String, default: newId },
      shootId: { type: String, required: true },
      teamMemberId: { type: String, required: true },
      role: { type: String, required: true },
    },
    baseSchemaOptions('crewCalls'),
  );
  schema.index({ shootId: 1, teamMemberId: 1 }, { unique: true });
  schema.index({ teamMemberId: 1 });
  schema.virtual('shoot', {
    ref: 'Shoot',
    localField: 'shootId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('teamMember', {
    ref: 'TeamMember',
    localField: 'teamMemberId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const AssetSchema = (() => {
  const schema = new Schema<T.Asset>(
    {
      _id: { type: String, default: newId },
      name: { type: String, required: true },
      category: { type: String, enum: Object.values(AssetCategory), required: true },
      serialTag: { type: String, required: true },
      homeLocation: { type: String, enum: Object.values(StudioLocation), required: true },
      status: { type: String, enum: Object.values(AssetStatus), default: 'AVAILABLE' },
      dailyRate: { type: Number, validate: Number.isInteger, required: true },
      notes: { type: String, default: null },
      condition: { type: String, enum: Object.values(AssetCondition), default: 'GOOD' },
      purchasedOn: { type: Date, default: null },
      purchaseCost: { type: Number, validate: Number.isInteger, default: null },
      custodianId: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('assets'),
  );
  touchUpdatedAt(schema);
  schema.index({ serialTag: 1 }, { unique: true });
  schema.index({ custodianId: 1 });
  schema.virtual('custodian', {
    ref: 'TeamMember',
    localField: 'custodianId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('bookings', {
    ref: 'AssetBooking',
    localField: '_id',
    foreignField: 'assetId',
    justOne: false,
  });
  schema.virtual('maintenance', {
    ref: 'AssetMaintenance',
    localField: '_id',
    foreignField: 'assetId',
    justOne: false,
  });
  return schema;
})();

export const AssetMaintenanceSchema = (() => {
  const schema = new Schema<T.AssetMaintenance>(
    {
      _id: { type: String, default: newId },
      assetId: { type: String, required: true },
      kind: { type: String, enum: Object.values(MaintenanceKind), required: true },
      description: { type: String, required: true },
      cost: { type: Number, validate: Number.isInteger, default: null },
      vendorId: { type: String, default: null },
      startedOn: { type: Date, required: true },
      completedOn: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('assetMaintenances'),
  );
  schema.index({ assetId: 1, startedOn: 1 });
  schema.index({ vendorId: 1 });
  schema.virtual('asset', {
    ref: 'Asset',
    localField: 'assetId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('vendor', {
    ref: 'Vendor',
    localField: 'vendorId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const AssetBookingSchema = (() => {
  const schema = new Schema<T.AssetBooking>(
    {
      _id: { type: String, default: newId },
      assetId: { type: String, required: true },
      shootId: { type: String, default: null },
      projectId: { type: String, default: null },
      startsAt: { type: Date, required: true },
      endsAt: { type: Date, required: true },
      note: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('assetBookings'),
  );
  schema.index({ assetId: 1, startsAt: 1 });
  schema.index({ shootId: 1 });
  schema.index({ projectId: 1 });
  schema.virtual('asset', {
    ref: 'Asset',
    localField: 'assetId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('shoot', {
    ref: 'Shoot',
    localField: 'shootId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const FinancialRecordSchema = (() => {
  const schema = new Schema<T.FinancialRecord>(
    {
      _id: { type: String, default: newId },
      projectId: { type: String, default: null },
      kind: { type: String, enum: Object.values(FinanceKind), required: true },
      category: { type: String, enum: Object.values(FinanceCategory), required: true },
      amount: { type: Number, validate: Number.isInteger, required: true },
      occurredOn: { type: Date, required: true },
      note: { type: String, default: null },
      isDemo: { type: Boolean, default: true },
      paymentId: { type: String, default: null },
      expenseId: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('financialRecords'),
  );
  schema.index(
    { paymentId: 1 },
    { unique: true, partialFilterExpression: { paymentId: { $type: 'string' } } },
  );
  schema.index(
    { expenseId: 1 },
    { unique: true, partialFilterExpression: { expenseId: { $type: 'string' } } },
  );
  schema.index({ occurredOn: 1 });
  schema.index({ projectId: 1 });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('payment', {
    ref: 'Payment',
    localField: 'paymentId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('expense', {
    ref: 'Expense',
    localField: 'expenseId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const ActivityLogSchema = (() => {
  const schema = new Schema<T.ActivityLog>(
    {
      _id: { type: String, default: newId },
      actorId: { type: String, default: null },
      source: { type: String, enum: Object.values(ActivitySource), default: 'UI' },
      action: { type: String, required: true },
      entityType: { type: String, required: true },
      entityId: { type: String, required: true },
      projectId: { type: String, default: null },
      summary: { type: String, required: true },
      metadata: { type: Schema.Types.Mixed, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('activityLogs'),
  );
  schema.index({ createdAt: 1 });
  schema.index({ entityType: 1, entityId: 1 });
  schema.index({ projectId: 1, createdAt: 1 });
  schema.index({ actorId: 1 });
  schema.virtual('actor', {
    ref: 'User',
    localField: 'actorId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const NotificationSchema = (() => {
  const schema = new Schema<T.Notification>(
    {
      _id: { type: String, default: newId },
      userId: { type: String, required: true },
      kind: { type: String, required: true },
      title: { type: String, required: true },
      body: { type: String, default: null },
      entityType: { type: String, default: null },
      entityId: { type: String, default: null },
      readAt: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('notifications'),
  );
  schema.index({ userId: 1, readAt: 1 });
  schema.virtual('user', { ref: 'User', localField: 'userId', foreignField: '_id', justOne: true });
  return schema;
})();

export const AssistantInteractionSchema = (() => {
  const schema = new Schema<T.AssistantInteraction>(
    {
      _id: { type: String, default: newId },
      userId: { type: String, required: true },
      role: { type: String, enum: Object.values(AssistantRole), required: true },
      content: { type: String, required: true },
      focusContext: { type: Schema.Types.Mixed, default: null },
      references: { type: Schema.Types.Mixed, default: null },
      provider: { type: String, required: true },
      language: { type: String, default: null },
      languageSource: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('assistantInteractions'),
  );
  schema.index({ userId: 1, createdAt: 1 });
  schema.virtual('user', { ref: 'User', localField: 'userId', foreignField: '_id', justOne: true });
  schema.virtual('actions', {
    ref: 'AssistantAction',
    localField: '_id',
    foreignField: 'interactionId',
    justOne: false,
  });
  return schema;
})();

export const AssistantActionSchema = (() => {
  const schema = new Schema<T.AssistantAction>(
    {
      _id: { type: String, default: newId },
      interactionId: { type: String, required: true },
      kind: { type: String, required: true },
      payload: { type: Schema.Types.Mixed },
      preview: { type: Schema.Types.Mixed },
      targetVersion: { type: String, default: null },
      status: { type: String, enum: Object.values(AssistantActionStatus), default: 'PROPOSED' },
      error: { type: String, default: null },
      resultEntityId: { type: String, default: null },
      resolvedAt: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('assistantActions'),
  );
  schema.index({ interactionId: 1 });
  schema.virtual('interaction', {
    ref: 'AssistantInteraction',
    localField: 'interactionId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const NotificationPreferenceSchema = (() => {
  const schema = new Schema<T.NotificationPreference>(
    {
      _id: { type: String, default: newId },
      userId: { type: String, required: true },
      kind: { type: String, required: true },
      inApp: { type: Boolean, default: true },
    },
    baseSchemaOptions('notificationPreferences'),
  );
  schema.index({ userId: 1, kind: 1 }, { unique: true });
  schema.virtual('user', { ref: 'User', localField: 'userId', foreignField: '_id', justOne: true });
  return schema;
})();

export const MilestoneSchema = (() => {
  const schema = new Schema<T.Milestone>(
    {
      _id: { type: String, default: newId },
      projectId: { type: String, required: true },
      title: { type: String, required: true },
      dueDate: { type: Date, required: true },
      completedAt: { type: Date, default: null },
      billingAmount: { type: Number, validate: Number.isInteger, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('milestones'),
  );
  schema.index({ projectId: 1, dueDate: 1 });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('invoices', {
    ref: 'Invoice',
    localField: '_id',
    foreignField: 'milestoneId',
    justOne: false,
  });
  return schema;
})();

export const ProjectRiskSchema = (() => {
  const schema = new Schema<T.ProjectRisk>(
    {
      _id: { type: String, default: newId },
      projectId: { type: String, required: true },
      title: { type: String, required: true },
      likelihood: { type: String, enum: Object.values(RiskLevel), required: true },
      impact: { type: String, enum: Object.values(RiskLevel), required: true },
      mitigation: { type: String, default: null },
      status: { type: String, enum: Object.values(RiskStatus), default: 'OPEN' },
      ownerId: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('projectRisks'),
  );
  touchUpdatedAt(schema);
  schema.index({ projectId: 1, status: 1 });
  schema.index({ ownerId: 1 });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('owner', {
    ref: 'TeamMember',
    localField: 'ownerId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const DepartmentSchema = (() => {
  const schema = new Schema<T.Department>(
    {
      _id: { type: String, default: newId },
      name: { type: String, required: true },
      description: { type: String, default: null },
      leadId: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('departments'),
  );
  schema.index({ name: 1 }, { unique: true });
  schema.index({ leadId: 1 });
  schema.virtual('lead', {
    ref: 'TeamMember',
    localField: 'leadId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('members', {
    ref: 'TeamMember',
    localField: '_id',
    foreignField: 'departmentId',
    justOne: false,
  });
  return schema;
})();

export const EmployeeRecordSchema = (() => {
  const schema = new Schema<T.EmployeeRecord>(
    {
      _id: { type: String, default: newId },
      teamMemberId: { type: String, required: true },
      employeeCode: { type: String, required: true },
      phone: { type: String, default: null },
      emergencyContact: { type: String, default: null },
      address: { type: String, default: null },
      notes: { type: String, default: null },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('employeeRecords'),
  );
  touchUpdatedAt(schema);
  schema.index({ teamMemberId: 1 }, { unique: true });
  schema.index({ employeeCode: 1 }, { unique: true });
  schema.virtual('teamMember', {
    ref: 'TeamMember',
    localField: 'teamMemberId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const LeaveRequestSchema = (() => {
  const schema = new Schema<T.LeaveRequest>(
    {
      _id: { type: String, default: newId },
      teamMemberId: { type: String, required: true },
      type: { type: String, enum: Object.values(LeaveType), required: true },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      reason: { type: String, default: null },
      status: { type: String, enum: Object.values(LeaveStatus), default: 'PENDING' },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('leaveRequests'),
  );
  touchUpdatedAt(schema);
  schema.index({ teamMemberId: 1, startDate: 1 });
  schema.index({ status: 1 });
  schema.virtual('teamMember', {
    ref: 'TeamMember',
    localField: 'teamMemberId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('approvalRequests', {
    ref: 'ApprovalRequest',
    localField: '_id',
    foreignField: 'leaveRequestId',
    justOne: false,
  });
  return schema;
})();

export const AttendanceRecordSchema = (() => {
  const schema = new Schema<T.AttendanceRecord>(
    {
      _id: { type: String, default: newId },
      teamMemberId: { type: String, required: true },
      date: { type: Date, required: true },
      status: { type: String, enum: Object.values(AttendanceStatus), required: true },
      checkIn: { type: Date, default: null },
      checkOut: { type: Date, default: null },
      note: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('attendanceRecords'),
  );
  schema.index({ teamMemberId: 1, date: 1 }, { unique: true });
  schema.index({ date: 1 });
  schema.virtual('teamMember', {
    ref: 'TeamMember',
    localField: 'teamMemberId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const VendorSchema = (() => {
  const schema = new Schema<T.Vendor>(
    {
      _id: { type: String, default: newId },
      name: { type: String, required: true },
      category: { type: String, enum: Object.values(VendorCategory), required: true },
      contactName: { type: String, default: null },
      email: { type: String, default: null },
      phone: { type: String, default: null },
      city: { type: String, default: null },
      notes: { type: String, default: null },
      isActive: { type: Boolean, default: true },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('vendors'),
  );
  touchUpdatedAt(schema);
  schema.index({ name: 1 }, { unique: true });
  schema.virtual('expenses', {
    ref: 'Expense',
    localField: '_id',
    foreignField: 'vendorId',
    justOne: false,
  });
  schema.virtual('quotes', {
    ref: 'VendorQuote',
    localField: '_id',
    foreignField: 'vendorId',
    justOne: false,
  });
  schema.virtual('purchaseOrders', {
    ref: 'PurchaseOrder',
    localField: '_id',
    foreignField: 'vendorId',
    justOne: false,
  });
  schema.virtual('maintenance', {
    ref: 'AssetMaintenance',
    localField: '_id',
    foreignField: 'vendorId',
    justOne: false,
  });
  schema.virtual('documents', {
    ref: 'Document',
    localField: '_id',
    foreignField: 'vendorId',
    justOne: false,
  });
  return schema;
})();

export const ApprovalRuleSchema = (() => {
  const schema = new Schema<T.ApprovalRule>(
    {
      _id: { type: String, default: newId },
      subject: { type: String, enum: Object.values(ApprovalSubject), required: true },
      name: { type: String, required: true },
      minAmount: { type: Number, validate: Number.isInteger, default: 0 },
      stepOrder: { type: Number, validate: Number.isInteger, required: true },
      permission: { type: String, required: true },
      isActive: { type: Boolean, default: true },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('approvalRules'),
  );
  schema.index({ subject: 1, isActive: 1 });
  return schema;
})();

export const ApprovalRequestSchema = (() => {
  const schema = new Schema<T.ApprovalRequest>(
    {
      _id: { type: String, default: newId },
      subject: { type: String, enum: Object.values(ApprovalSubject), required: true },
      status: { type: String, enum: Object.values(ApprovalRequestStatus), default: 'PENDING' },
      title: { type: String, required: true },
      amount: { type: Number, validate: Number.isInteger, default: null },
      currentStep: { type: Number, validate: Number.isInteger, default: 1 },
      requestedById: { type: String, required: true },
      projectId: { type: String, default: null },
      expenseId: { type: String, default: null },
      purchaseRequestId: { type: String, default: null },
      leaveRequestId: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
      decidedAt: { type: Date, default: null },
    },
    baseSchemaOptions('approvalRequests'),
  );
  schema.index({ status: 1, subject: 1 });
  schema.index({ expenseId: 1 });
  schema.index({ purchaseRequestId: 1 });
  schema.index({ leaveRequestId: 1 });
  schema.index({ requestedById: 1 });
  schema.index({ projectId: 1 });
  schema.virtual('requestedBy', {
    ref: 'User',
    localField: 'requestedById',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('expense', {
    ref: 'Expense',
    localField: 'expenseId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('purchaseRequest', {
    ref: 'PurchaseRequest',
    localField: 'purchaseRequestId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('leaveRequest', {
    ref: 'LeaveRequest',
    localField: 'leaveRequestId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('steps', {
    ref: 'ApprovalStep',
    localField: '_id',
    foreignField: 'requestId',
    justOne: false,
  });
  return schema;
})();

export const ApprovalStepSchema = (() => {
  const schema = new Schema<T.ApprovalStep>(
    {
      _id: { type: String, default: newId },
      requestId: { type: String, required: true },
      order: { type: Number, validate: Number.isInteger, required: true },
      label: { type: String, required: true },
      permission: { type: String, required: true },
      status: { type: String, enum: Object.values(ApprovalStepStatus), default: 'WAITING' },
      deciderId: { type: String, default: null },
      reason: { type: String, default: null },
      decidedAt: { type: Date, default: null },
    },
    baseSchemaOptions('approvalSteps'),
  );
  schema.index({ requestId: 1, order: 1 }, { unique: true });
  schema.index({ status: 1, permission: 1 });
  schema.index({ deciderId: 1 });
  schema.virtual('request', {
    ref: 'ApprovalRequest',
    localField: 'requestId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('decider', {
    ref: 'User',
    localField: 'deciderId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const ExpenseSchema = (() => {
  const schema = new Schema<T.Expense>(
    {
      _id: { type: String, default: newId },
      number: { type: String, required: true },
      title: { type: String, required: true },
      category: { type: String, enum: Object.values(FinanceCategory), required: true },
      amount: { type: Number, validate: Number.isInteger, required: true },
      incurredOn: { type: Date, required: true },
      projectId: { type: String, default: null },
      vendorId: { type: String, default: null },
      purchaseOrderId: { type: String, default: null },
      submittedById: { type: String, required: true },
      status: { type: String, enum: Object.values(ExpenseStatus), default: 'DRAFT' },
      notes: { type: String, default: null },
      paidAt: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('expenses'),
  );
  touchUpdatedAt(schema);
  schema.index({ number: 1 }, { unique: true });
  schema.index(
    { purchaseOrderId: 1 },
    { unique: true, partialFilterExpression: { purchaseOrderId: { $type: 'string' } } },
  );
  schema.index({ status: 1 });
  schema.index({ projectId: 1 });
  schema.index({ vendorId: 1 });
  schema.index({ submittedById: 1 });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('vendor', {
    ref: 'Vendor',
    localField: 'vendorId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('purchaseOrder', {
    ref: 'PurchaseOrder',
    localField: 'purchaseOrderId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('submittedBy', {
    ref: 'User',
    localField: 'submittedById',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('ledger', {
    ref: 'FinancialRecord',
    localField: '_id',
    foreignField: 'expenseId',
    justOne: true,
  });
  schema.virtual('approvals', {
    ref: 'ApprovalRequest',
    localField: '_id',
    foreignField: 'expenseId',
    justOne: false,
  });
  schema.virtual('documents', {
    ref: 'Document',
    localField: '_id',
    foreignField: 'expenseId',
    justOne: false,
  });
  return schema;
})();

export const InvoiceSchema = (() => {
  const schema = new Schema<T.Invoice>(
    {
      _id: { type: String, default: newId },
      number: { type: String, required: true },
      clientId: { type: String, required: true },
      projectId: { type: String, default: null },
      milestoneId: { type: String, default: null },
      status: { type: String, enum: Object.values(InvoiceStatus), default: 'DRAFT' },
      issueDate: { type: Date, required: true },
      dueDate: { type: Date, required: true },
      taxPercent: { type: Number, validate: Number.isInteger, default: 0 },
      subtotal: { type: Number, validate: Number.isInteger, required: true },
      tax: { type: Number, validate: Number.isInteger, required: true },
      total: { type: Number, validate: Number.isInteger, required: true },
      notes: { type: String, default: null },
      sentAt: { type: Date, default: null },
      createdById: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('invoices'),
  );
  touchUpdatedAt(schema);
  schema.index({ number: 1 }, { unique: true });
  schema.index({ status: 1, dueDate: 1 });
  schema.index({ clientId: 1 });
  schema.index({ projectId: 1 });
  schema.index({ milestoneId: 1 });
  schema.index({ createdById: 1 });
  schema.virtual('client', {
    ref: 'Client',
    localField: 'clientId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('milestone', {
    ref: 'Milestone',
    localField: 'milestoneId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('createdBy', {
    ref: 'User',
    localField: 'createdById',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('lines', {
    ref: 'InvoiceLine',
    localField: '_id',
    foreignField: 'invoiceId',
    justOne: false,
  });
  schema.virtual('payments', {
    ref: 'Payment',
    localField: '_id',
    foreignField: 'invoiceId',
    justOne: false,
  });
  schema.virtual('documents', {
    ref: 'Document',
    localField: '_id',
    foreignField: 'invoiceId',
    justOne: false,
  });
  return schema;
})();

export const InvoiceLineSchema = (() => {
  const schema = new Schema<T.InvoiceLine>(
    {
      _id: { type: String, default: newId },
      invoiceId: { type: String, required: true },
      order: { type: Number, validate: Number.isInteger, required: true },
      description: { type: String, required: true },
      quantity: { type: Number, validate: Number.isInteger, required: true },
      unitPrice: { type: Number, validate: Number.isInteger, required: true },
      amount: { type: Number, validate: Number.isInteger, required: true },
    },
    baseSchemaOptions('invoiceLines'),
  );
  schema.index({ invoiceId: 1, order: 1 }, { unique: true });
  schema.virtual('invoice', {
    ref: 'Invoice',
    localField: 'invoiceId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const PaymentSchema = (() => {
  const schema = new Schema<T.Payment>(
    {
      _id: { type: String, default: newId },
      invoiceId: { type: String, required: true },
      amount: { type: Number, validate: Number.isInteger, required: true },
      receivedOn: { type: Date, required: true },
      method: { type: String, enum: Object.values(PaymentMethod), required: true },
      reference: { type: String, default: null },
      recordedById: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('payments'),
  );
  schema.index({ invoiceId: 1 });
  schema.index({ recordedById: 1 });
  schema.virtual('invoice', {
    ref: 'Invoice',
    localField: 'invoiceId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('recordedBy', {
    ref: 'User',
    localField: 'recordedById',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('ledger', {
    ref: 'FinancialRecord',
    localField: '_id',
    foreignField: 'paymentId',
    justOne: true,
  });
  return schema;
})();

export const PurchaseRequestSchema = (() => {
  const schema = new Schema<T.PurchaseRequest>(
    {
      _id: { type: String, default: newId },
      number: { type: String, required: true },
      title: { type: String, required: true },
      justification: { type: String, default: null },
      projectId: { type: String, default: null },
      requestedById: { type: String, required: true },
      neededBy: { type: Date, default: null },
      status: { type: String, enum: Object.values(PurchaseRequestStatus), default: 'DRAFT' },
      estimatedTotal: { type: Number, validate: Number.isInteger, required: true },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('purchaseRequests'),
  );
  touchUpdatedAt(schema);
  schema.index({ number: 1 }, { unique: true });
  schema.index({ status: 1 });
  schema.index({ projectId: 1 });
  schema.index({ requestedById: 1 });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('requestedBy', {
    ref: 'User',
    localField: 'requestedById',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('items', {
    ref: 'PurchaseRequestItem',
    localField: '_id',
    foreignField: 'requestId',
    justOne: false,
  });
  schema.virtual('quotes', {
    ref: 'VendorQuote',
    localField: '_id',
    foreignField: 'requestId',
    justOne: false,
  });
  schema.virtual('order', {
    ref: 'PurchaseOrder',
    localField: '_id',
    foreignField: 'requestId',
    justOne: true,
  });
  schema.virtual('approvals', {
    ref: 'ApprovalRequest',
    localField: '_id',
    foreignField: 'purchaseRequestId',
    justOne: false,
  });
  return schema;
})();

export const PurchaseRequestItemSchema = (() => {
  const schema = new Schema<T.PurchaseRequestItem>(
    {
      _id: { type: String, default: newId },
      requestId: { type: String, required: true },
      description: { type: String, required: true },
      quantity: { type: Number, validate: Number.isInteger, required: true },
      estimatedUnitCost: { type: Number, validate: Number.isInteger, required: true },
      stockItemId: { type: String, default: null },
    },
    baseSchemaOptions('purchaseRequestItems'),
  );
  schema.index({ requestId: 1 });
  schema.index({ stockItemId: 1 });
  schema.virtual('request', {
    ref: 'PurchaseRequest',
    localField: 'requestId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('stockItem', {
    ref: 'StockItem',
    localField: 'stockItemId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const VendorQuoteSchema = (() => {
  const schema = new Schema<T.VendorQuote>(
    {
      _id: { type: String, default: newId },
      requestId: { type: String, required: true },
      vendorId: { type: String, required: true },
      amount: { type: Number, validate: Number.isInteger, required: true },
      validUntil: { type: Date, default: null },
      notes: { type: String, default: null },
      isSelected: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('vendorQuotes'),
  );
  schema.index({ requestId: 1, vendorId: 1 }, { unique: true });
  schema.index({ vendorId: 1 });
  schema.virtual('request', {
    ref: 'PurchaseRequest',
    localField: 'requestId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('vendor', {
    ref: 'Vendor',
    localField: 'vendorId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const PurchaseOrderSchema = (() => {
  const schema = new Schema<T.PurchaseOrder>(
    {
      _id: { type: String, default: newId },
      number: { type: String, required: true },
      requestId: { type: String, default: null },
      vendorId: { type: String, required: true },
      status: { type: String, enum: Object.values(PurchaseOrderStatus), default: 'ISSUED' },
      issuedOn: { type: Date, required: true },
      expectedOn: { type: Date, default: null },
      total: { type: Number, validate: Number.isInteger, required: true },
      notes: { type: String, default: null },
      createdById: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('purchaseOrders'),
  );
  touchUpdatedAt(schema);
  schema.index({ number: 1 }, { unique: true });
  schema.index(
    { requestId: 1 },
    { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } },
  );
  schema.index({ status: 1 });
  schema.index({ vendorId: 1 });
  schema.index({ createdById: 1 });
  schema.virtual('request', {
    ref: 'PurchaseRequest',
    localField: 'requestId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('vendor', {
    ref: 'Vendor',
    localField: 'vendorId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('createdBy', {
    ref: 'User',
    localField: 'createdById',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('lines', {
    ref: 'PurchaseOrderLine',
    localField: '_id',
    foreignField: 'orderId',
    justOne: false,
  });
  schema.virtual('bill', {
    ref: 'Expense',
    localField: '_id',
    foreignField: 'purchaseOrderId',
    justOne: true,
  });
  schema.virtual('documents', {
    ref: 'Document',
    localField: '_id',
    foreignField: 'purchaseOrderId',
    justOne: false,
  });
  return schema;
})();

export const PurchaseOrderLineSchema = (() => {
  const schema = new Schema<T.PurchaseOrderLine>(
    {
      _id: { type: String, default: newId },
      orderId: { type: String, required: true },
      description: { type: String, required: true },
      quantity: { type: Number, validate: Number.isInteger, required: true },
      unitCost: { type: Number, validate: Number.isInteger, required: true },
      receivedQty: { type: Number, validate: Number.isInteger, default: 0 },
      stockItemId: { type: String, default: null },
    },
    baseSchemaOptions('purchaseOrderLines'),
  );
  schema.index({ orderId: 1 });
  schema.index({ stockItemId: 1 });
  schema.virtual('order', {
    ref: 'PurchaseOrder',
    localField: 'orderId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('stockItem', {
    ref: 'StockItem',
    localField: 'stockItemId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('movements', {
    ref: 'StockMovement',
    localField: '_id',
    foreignField: 'purchaseOrderLineId',
    justOne: false,
  });
  return schema;
})();

export const StockItemSchema = (() => {
  const schema = new Schema<T.StockItem>(
    {
      _id: { type: String, default: newId },
      sku: { type: String, required: true },
      name: { type: String, required: true },
      category: { type: String, enum: Object.values(StockCategory), required: true },
      unit: { type: String, required: true },
      onHand: { type: Number, validate: Number.isInteger, default: 0 },
      reorderLevel: { type: Number, validate: Number.isInteger, default: 0 },
      location: { type: String, enum: Object.values(StudioLocation), required: true },
      unitCost: { type: Number, validate: Number.isInteger, required: true },
      notes: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('stockItems'),
  );
  touchUpdatedAt(schema);
  schema.index({ sku: 1 }, { unique: true });
  schema.virtual('movements', {
    ref: 'StockMovement',
    localField: '_id',
    foreignField: 'stockItemId',
    justOne: false,
  });
  schema.virtual('requestItems', {
    ref: 'PurchaseRequestItem',
    localField: '_id',
    foreignField: 'stockItemId',
    justOne: false,
  });
  schema.virtual('orderLines', {
    ref: 'PurchaseOrderLine',
    localField: '_id',
    foreignField: 'stockItemId',
    justOne: false,
  });
  return schema;
})();

export const StockMovementSchema = (() => {
  const schema = new Schema<T.StockMovement>(
    {
      _id: { type: String, default: newId },
      stockItemId: { type: String, required: true },
      type: { type: String, enum: Object.values(StockMovementType), required: true },
      quantity: { type: Number, validate: Number.isInteger, required: true },
      balanceAfter: { type: Number, validate: Number.isInteger, required: true },
      projectId: { type: String, default: null },
      purchaseOrderLineId: { type: String, default: null },
      note: { type: String, default: null },
      actorId: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('stockMovements'),
  );
  schema.index({ stockItemId: 1, createdAt: 1 });
  schema.index({ projectId: 1 });
  schema.index({ purchaseOrderLineId: 1 });
  schema.index({ actorId: 1 });
  schema.virtual('stockItem', {
    ref: 'StockItem',
    localField: 'stockItemId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('purchaseOrderLine', {
    ref: 'PurchaseOrderLine',
    localField: 'purchaseOrderLineId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('actor', {
    ref: 'User',
    localField: 'actorId',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const StudioSchema = (() => {
  const schema = new Schema<T.Studio>(
    {
      _id: { type: String, default: newId },
      name: { type: String, required: true },
      location: { type: String, enum: Object.values(StudioLocation), required: true },
      kind: { type: String, required: true },
      capacity: { type: Number, validate: Number.isInteger, default: null },
      hourlyRate: { type: Number, validate: Number.isInteger, required: true },
      features: { type: [String], default: [] },
      isActive: { type: Boolean, default: true },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('studios'),
  );
  schema.index({ name: 1 }, { unique: true });
  schema.virtual('bookings', {
    ref: 'StudioBooking',
    localField: '_id',
    foreignField: 'studioId',
    justOne: false,
  });
  return schema;
})();

export const StudioBookingSchema = (() => {
  const schema = new Schema<T.StudioBooking>(
    {
      _id: { type: String, default: newId },
      studioId: { type: String, required: true },
      title: { type: String, required: true },
      projectId: { type: String, default: null },
      shootId: { type: String, default: null },
      startsAt: { type: Date, required: true },
      endsAt: { type: Date, required: true },
      status: { type: String, enum: Object.values(StudioBookingStatus), default: 'CONFIRMED' },
      notes: { type: String, default: null },
      bookedById: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('studioBookings'),
  );
  touchUpdatedAt(schema);
  schema.index({ studioId: 1, startsAt: 1 });
  schema.index({ projectId: 1 });
  schema.index({ shootId: 1 });
  schema.index({ bookedById: 1 });
  schema.virtual('studio', {
    ref: 'Studio',
    localField: 'studioId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('shoot', {
    ref: 'Shoot',
    localField: 'shootId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('bookedBy', {
    ref: 'User',
    localField: 'bookedById',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const DocumentSchema = (() => {
  const schema = new Schema<T.Document>(
    {
      _id: { type: String, default: newId },
      title: { type: String, required: true },
      category: { type: String, enum: Object.values(DocumentCategory), required: true },
      description: { type: String, default: null },
      confidential: { type: Boolean, default: false },
      currentVersion: { type: Number, validate: Number.isInteger, default: 0 },
      projectId: { type: String, default: null },
      clientId: { type: String, default: null },
      leadId: { type: String, default: null },
      vendorId: { type: String, default: null },
      teamMemberId: { type: String, default: null },
      invoiceId: { type: String, default: null },
      expenseId: { type: String, default: null },
      purchaseOrderId: { type: String, default: null },
      createdById: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('documents'),
  );
  touchUpdatedAt(schema);
  schema.index({ category: 1 });
  schema.index({ projectId: 1 });
  schema.index({ clientId: 1 });
  schema.index({ leadId: 1 });
  schema.index({ vendorId: 1 });
  schema.index({ teamMemberId: 1 });
  schema.index({ invoiceId: 1 });
  schema.index({ expenseId: 1 });
  schema.index({ purchaseOrderId: 1 });
  schema.index({ createdById: 1 });
  schema.virtual('project', {
    ref: 'Project',
    localField: 'projectId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('client', {
    ref: 'Client',
    localField: 'clientId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('lead', { ref: 'Lead', localField: 'leadId', foreignField: '_id', justOne: true });
  schema.virtual('vendor', {
    ref: 'Vendor',
    localField: 'vendorId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('teamMember', {
    ref: 'TeamMember',
    localField: 'teamMemberId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('invoice', {
    ref: 'Invoice',
    localField: 'invoiceId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('expense', {
    ref: 'Expense',
    localField: 'expenseId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('purchaseOrder', {
    ref: 'PurchaseOrder',
    localField: 'purchaseOrderId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('createdBy', {
    ref: 'User',
    localField: 'createdById',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('versions', {
    ref: 'DocumentVersion',
    localField: '_id',
    foreignField: 'documentId',
    justOne: false,
  });
  return schema;
})();

export const DocumentVersionSchema = (() => {
  const schema = new Schema<T.DocumentVersion>(
    {
      _id: { type: String, default: newId },
      documentId: { type: String, required: true },
      version: { type: Number, validate: Number.isInteger, required: true },
      fileName: { type: String, required: true },
      mimeType: { type: String, required: true },
      sizeBytes: { type: Number, validate: Number.isInteger, required: true },
      sha256: { type: String, required: true },
      storageKey: { type: String, required: true },
      note: { type: String, default: null },
      uploadedById: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },
    baseSchemaOptions('documentVersions'),
  );
  schema.index({ storageKey: 1 }, { unique: true });
  schema.index({ documentId: 1, version: 1 }, { unique: true });
  schema.index({ uploadedById: 1 });
  schema.virtual('document', {
    ref: 'Document',
    localField: 'documentId',
    foreignField: '_id',
    justOne: true,
  });
  schema.virtual('uploadedBy', {
    ref: 'User',
    localField: 'uploadedById',
    foreignField: '_id',
    justOne: true,
  });
  return schema;
})();

export const SCHEMAS = {
  User: UserSchema,
  Session: SessionSchema,
  Role: RoleSchema,
  Permission: PermissionSchema,
  RolePermission: RolePermissionSchema,
  TeamMember: TeamMemberSchema,
  ProjectMember: ProjectMemberSchema,
  Client: ClientSchema,
  ClientContact: ClientContactSchema,
  ClientInteraction: ClientInteractionSchema,
  Lead: LeadSchema,
  WorkflowTemplate: WorkflowTemplateSchema,
  StageDefinition: StageDefinitionSchema,
  Project: ProjectSchema,
  ProjectStage: ProjectStageSchema,
  StageTransition: StageTransitionSchema,
  Task: TaskSchema,
  TaskDependency: TaskDependencySchema,
  Deliverable: DeliverableSchema,
  RevisionRound: RevisionRoundSchema,
  FeedbackItem: FeedbackItemSchema,
  Approval: ApprovalSchema,
  Shoot: ShootSchema,
  CrewCall: CrewCallSchema,
  Asset: AssetSchema,
  AssetMaintenance: AssetMaintenanceSchema,
  AssetBooking: AssetBookingSchema,
  FinancialRecord: FinancialRecordSchema,
  ActivityLog: ActivityLogSchema,
  Notification: NotificationSchema,
  AssistantInteraction: AssistantInteractionSchema,
  AssistantAction: AssistantActionSchema,
  NotificationPreference: NotificationPreferenceSchema,
  Milestone: MilestoneSchema,
  ProjectRisk: ProjectRiskSchema,
  Department: DepartmentSchema,
  EmployeeRecord: EmployeeRecordSchema,
  LeaveRequest: LeaveRequestSchema,
  AttendanceRecord: AttendanceRecordSchema,
  Vendor: VendorSchema,
  ApprovalRule: ApprovalRuleSchema,
  ApprovalRequest: ApprovalRequestSchema,
  ApprovalStep: ApprovalStepSchema,
  Expense: ExpenseSchema,
  Invoice: InvoiceSchema,
  InvoiceLine: InvoiceLineSchema,
  Payment: PaymentSchema,
  PurchaseRequest: PurchaseRequestSchema,
  PurchaseRequestItem: PurchaseRequestItemSchema,
  VendorQuote: VendorQuoteSchema,
  PurchaseOrder: PurchaseOrderSchema,
  PurchaseOrderLine: PurchaseOrderLineSchema,
  StockItem: StockItemSchema,
  StockMovement: StockMovementSchema,
  Studio: StudioSchema,
  StudioBooking: StudioBookingSchema,
  Document: DocumentSchema,
  DocumentVersion: DocumentVersionSchema,
} as const;
