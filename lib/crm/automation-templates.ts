/**
 * Starter automation templates. Picking one in the editor seeds an initial
 * graph the user can then customize. Templates are intentionally minimal —
 * they describe the *shape* of a common workflow, but every node still
 * requires concrete config (tag id, message body, stage id, etc.) before it
 * can actually run.
 */

import type { Node, Edge } from 'reactflow'
import type { TriggerType, ActionType } from '@/lib/crm/validations/automation'
import { ACTION_TYPE_LABELS, TRIGGER_TYPE_LABELS } from '@/lib/crm/validations/automation'

export interface AutomationTemplate {
  id: string
  name: string
  summary: string
  triggerType: TriggerType
  graph: { nodes: Node[]; edges: Edge[] }
}

function triggerNode(triggerType: TriggerType): Node {
  return {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 220, y: 40 },
    data: { label: TRIGGER_TYPE_LABELS[triggerType], triggerType },
  }
}

function actionNode(id: string, actionType: ActionType, y: number, extra: Record<string, unknown> = {}): Node {
  return {
    id,
    type: 'action',
    position: { x: 220, y },
    data: { label: ACTION_TYPE_LABELS[actionType], actionType, ...extra },
  }
}

function delayNode(id: string, y: number, amount: number, unit: 'minutes' | 'hours' | 'days'): Node {
  const ms = unit === 'days' ? amount * 86_400_000 : unit === 'hours' ? amount * 3_600_000 : amount * 60_000
  return {
    id,
    type: 'delay',
    position: { x: 220, y },
    data: { label: `Wait ${amount} ${unit}`, amount, unit, delayMs: ms },
  }
}

function edge(source: string, target: string): Edge {
  return { id: `e-${source}-${target}`, source, target }
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'welcome-new-lead',
    name: 'Welcome new lead',
    summary: 'Send a WhatsApp greeting the moment a lead is created.',
    triggerType: 'NEW_LEAD',
    graph: {
      nodes: [
        triggerNode('NEW_LEAD'),
        actionNode('whatsapp-1', 'SEND_WHATSAPP', 180, {
          body: 'Hi {{contact.firstName}}, thanks for reaching out to Ebright {{branch.name}}. A coach will contact you shortly to schedule a trial class.',
        }),
      ],
      edges: [edge('trigger-1', 'whatsapp-1')],
    },
  },
  {
    id: 'whatsapp-lead-followup',
    name: 'WhatsApp lead — greet, assign & alert branch',
    summary: 'When a branch converts a WhatsApp inbox lead: auto-greet on WhatsApp, then alert the branch manager to follow up.',
    triggerType: 'WHATSAPP_LEAD',
    graph: {
      nodes: [
        triggerNode('WHATSAPP_LEAD'),
        actionNode('whatsapp-1', 'SEND_WHATSAPP', 180, {
          body: 'Hi {{contact.firstName}}, thanks for messaging Ebright {{branch.name}} on WhatsApp! A coach will reach out shortly to arrange a free trial class for {{contact.childName1}}.',
        }),
        actionNode('notify-1', 'SEND_INTERNAL_NOTIFICATION', 320, {
          title: 'New WhatsApp lead',
          body: '{{contact.firstName}} came in via WhatsApp at {{branch.name}} — follow up to confirm a trial.',
        }),
      ],
      edges: [edge('trigger-1', 'whatsapp-1'), edge('whatsapp-1', 'notify-1')],
    },
  },
  {
    id: 'no-reply-followup-24h',
    name: 'No reply — follow up after 24h',
    summary: 'If the lead has not replied within a day, send a gentle nudge.',
    triggerType: 'NEW_LEAD',
    graph: {
      nodes: [
        triggerNode('NEW_LEAD'),
        delayNode('wait-1', 180, 24, 'hours'),
        actionNode('whatsapp-1', 'SEND_WHATSAPP', 320, {
          body: 'Hi {{contact.firstName}}, just checking in — are you still interested in a free trial at Ebright {{branch.name}}?',
        }),
      ],
      edges: [edge('trigger-1', 'wait-1'), edge('wait-1', 'whatsapp-1')],
    },
  },
  {
    id: 'trial-confirmation',
    name: 'Trial confirmation + reminder',
    summary: 'When stage moves to CT, WhatsApp confirmation + reminder 2h before.',
    triggerType: 'STAGE_CHANGED',
    graph: {
      nodes: [
        triggerNode('STAGE_CHANGED'),
        actionNode('whatsapp-1', 'SEND_WHATSAPP', 180, {
          body: 'Hi {{contact.firstName}}, your trial class at Ebright {{branch.name}} is confirmed. See you soon!',
        }),
        delayNode('wait-1', 320, 22, 'hours'),
        actionNode('whatsapp-2', 'SEND_WHATSAPP', 460, {
          body: 'Reminder: your trial class is in 2 hours. Address: {{branch.address}}. Reply STOP to cancel.',
        }),
      ],
      edges: [
        edge('trigger-1', 'whatsapp-1'),
        edge('whatsapp-1', 'wait-1'),
        edge('wait-1', 'whatsapp-2'),
      ],
    },
  },
  {
    id: 'show-up-tag-task',
    name: 'Show-up handling',
    summary: 'When stage moves to SU, tag the lead and create a follow-up task.',
    triggerType: 'STAGE_CHANGED',
    graph: {
      nodes: [
        triggerNode('STAGE_CHANGED'),
        actionNode('tag-1', 'ADD_TAG', 180),
        actionNode('task-1', 'CREATE_TASK', 320, {
          title: 'Follow up with {{contact.firstName}} post-trial',
          dueOffsetHours: 24,
        }),
      ],
      edges: [edge('trigger-1', 'tag-1'), edge('tag-1', 'task-1')],
    },
  },
  {
    id: 'stale-3-day-nudge',
    name: 'Stale lead — 3 day nudge',
    summary: 'If the lead has been in stage for 3 days, send a WhatsApp + notify branch manager.',
    triggerType: 'TIME_IN_STAGE',
    graph: {
      nodes: [
        triggerNode('TIME_IN_STAGE'),
        actionNode('whatsapp-1', 'SEND_WHATSAPP', 180, {
          body: 'Hi {{contact.firstName}}, still interested in joining {{branch.name}}? Reply YES to continue.',
        }),
        actionNode('notify-1', 'SEND_INTERNAL_NOTIFICATION', 320, {
          title: 'Stale lead',
          body: '{{contact.firstName}} has been idle for 3 days.',
        }),
      ],
      edges: [edge('trigger-1', 'whatsapp-1'), edge('whatsapp-1', 'notify-1')],
    },
  },
  {
    id: 'enrolment-celebration',
    name: 'Enrolment celebration',
    summary: 'On ENR stage move: tag as customer, send thank-you email, notify team.',
    triggerType: 'STAGE_CHANGED',
    graph: {
      nodes: [
        triggerNode('STAGE_CHANGED'),
        actionNode('tag-1', 'ADD_TAG', 180),
        actionNode('email-1', 'SEND_EMAIL', 320, {
          subject: 'Welcome to Ebright!',
          body: '<p>Hi {{contact.firstName}}, welcome to the Ebright family! Your enrolment is confirmed.</p>',
        }),
        actionNode('notify-1', 'SEND_INTERNAL_NOTIFICATION', 460, {
          title: 'New enrolment!',
          body: '{{contact.firstName}} just enrolled at {{branch.name}}.',
        }),
      ],
      edges: [
        edge('trigger-1', 'tag-1'),
        edge('tag-1', 'email-1'),
        edge('email-1', 'notify-1'),
      ],
    },
  },
]
