// src/models/Barrier.ts

export interface BarrierStatus {
  step: string;
  completedCount: number;
  totalCount: number;
  released: boolean;
}

export interface PresentMember {
  id: number;
  email: string;
  present_at: Date;
}

export interface StepCompletion {
  student_id: number;
  completed_at: Date;
}
