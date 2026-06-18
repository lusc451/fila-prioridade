import type { Patient, Professional, QueueEntry } from "./types";

export const seedPatients: Patient[] = [
  { id: "p1", name: "Ana Beatriz Souza", birthDate: "1986-04-12", phone: "(11) 98765-4321", notes: "Hipertensa." },
  { id: "p2", name: "Carlos Eduardo Lima", birthDate: "1972-09-03", phone: "(11) 99123-4455" },
  { id: "p3", name: "Mariana Oliveira", birthDate: "1995-12-21", phone: "(21) 98888-2233", notes: "Alergia a dipirona." },
  { id: "p4", name: "João Pedro Almeida", birthDate: "1959-02-17", phone: "(31) 97777-1100" },
  { id: "p5", name: "Fernanda Ribeiro", birthDate: "2001-07-30", phone: "(11) 96655-8899" },
  { id: "p6", name: "Roberto Carvalho", birthDate: "1968-11-05", phone: "(11) 95544-7788", notes: "Diabético." },
  { id: "p7", name: "Patrícia Mendes", birthDate: "1990-03-25", phone: "(21) 94433-6677" },
  { id: "p8", name: "Lucas Martins", birthDate: "1983-06-14", phone: "(11) 93322-5566" },
  { id: "p9", name: "Camila Rocha", birthDate: "1978-08-09", phone: "(11) 92211-4455" },
];

export const seedProfessionals: Professional[] = [
  { id: "d1", name: "Dra. Helena Castro", specialty: "Clínica Geral", contact: "(11) 3000-1001", active: true },
  { id: "d2", name: "Dr. Ricardo Vieira", specialty: "Cardiologia", contact: "(11) 3000-1002", active: true },
  { id: "d3", name: "Dra. Juliana Pires", specialty: "Pediatria", contact: "(11) 3000-1003", active: true },
  { id: "d4", name: "Dr. Marcos Tavares", specialty: "Ortopedia", contact: "(11) 3000-1004", active: true },
  { id: "d5", name: "Dra. Beatriz Nogueira", specialty: "Dermatologia", contact: "(11) 3000-1005", active: false },
  { id: "d6", name: "Dr. André Sampaio", specialty: "Endocrinologia", contact: "(11) 3000-1006", active: true },
];

const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString();
const ymd = (n: number) => new Date(now - n * 86400000).toISOString().slice(0, 10);

export const seedQueue: QueueEntry[] = [
  { id: "q1", patientId: "p1", professionalId: "d2", firstAppointment: false, lastAppointmentDate: ymd(120), notes: "Dor torácica recorrente.", priority: "urgencia", createdAt: daysAgo(0), status: "ativo" },
  { id: "q2", patientId: "p6", professionalId: "d6", firstAppointment: false, lastAppointmentDate: ymd(45), notes: "Avaliação de hemoglobina glicada.", priority: "exame", createdAt: daysAgo(1), status: "ativo" },
  { id: "q3", patientId: "p3", professionalId: "d1", firstAppointment: true, notes: "Primeira consulta — queixa de cefaleia.", priority: "retorno_prioritario", createdAt: daysAgo(2), status: "ativo" },
  { id: "q4", patientId: "p2", professionalId: "d2", firstAppointment: false, lastAppointmentDate: ymd(200), notes: "Renovação de receita.", priority: "retorno_rotina", createdAt: daysAgo(3), status: "ativo" },
  { id: "q5", patientId: "p4", professionalId: "d4", firstAppointment: false, lastAppointmentDate: ymd(30), notes: "Avaliação pós-cirurgia de joelho.", priority: "exame", createdAt: daysAgo(2), status: "ativo" },
  { id: "q6", patientId: "p5", professionalId: "d1", firstAppointment: true, notes: "Check-up anual.", priority: "retorno_rotina", createdAt: daysAgo(4), status: "ativo" },
  { id: "q7", patientId: "p7", professionalId: "d3", firstAppointment: false, lastAppointmentDate: ymd(15), notes: "Acompanhamento de tratamento.", priority: "retorno_prioritario", createdAt: daysAgo(1), status: "ativo" },
  { id: "q8", patientId: "p8", professionalId: "d4", firstAppointment: false, lastAppointmentDate: ymd(10), notes: "Dor lombar aguda.", priority: "urgencia", createdAt: daysAgo(0), status: "ativo" },
  { id: "q9", patientId: "p9", professionalId: "d6", firstAppointment: true, notes: "Suspeita de hipotireoidismo.", priority: "exame", createdAt: daysAgo(5), status: "ativo" },
  { id: "q10", patientId: "p1", professionalId: "d1", firstAppointment: false, lastAppointmentDate: ymd(90), notes: "Revisão de medicação.", priority: "retorno_prioritario", createdAt: daysAgo(6), status: "ativo" },
  { id: "q11", patientId: "p6", professionalId: "d1", firstAppointment: false, lastAppointmentDate: ymd(180), notes: "Consulta de rotina.", priority: "retorno_rotina", createdAt: daysAgo(7), status: "ativo" },
  { id: "q12", patientId: "p2", professionalId: "d6", firstAppointment: false, lastAppointmentDate: ymd(20), notes: "Resultado de exames laboratoriais.", priority: "exame", createdAt: daysAgo(2), status: "ativo" },
  { id: "q13", patientId: "p3", professionalId: "d1", firstAppointment: false, lastAppointmentDate: ymd(60), notes: "Consulta concluída em revisão.", priority: "retorno_rotina", createdAt: daysAgo(20), status: "concluido", completedAt: daysAgo(10) },
  { id: "q14", patientId: "p5", professionalId: "d3", firstAppointment: true, notes: "Avaliação inicial concluída.", priority: "retorno_prioritario", createdAt: daysAgo(25), status: "concluido", completedAt: daysAgo(15) },
];
