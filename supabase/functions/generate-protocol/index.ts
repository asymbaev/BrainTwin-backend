// supabase/functions/generate-protocol/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GenerateRequest {
  userId: string
  forceNew?: boolean // Optional: force generate even if today's protocol exists
}

interface ProtocolStep {
  instruction: string
  durationSeconds: number
  type: 'breathing' | 'movement' | 'mindfulness' | 'cognitive' | 'sensory'
}

interface GeneratedProtocol {
  title: string
  description: string
  durationSeconds: number
  steps: ProtocolStep[]
  neuroscience: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, forceNew = false }: GenerateRequest = await req.json()

    if (!userId) {
      throw new Error('Missing userId')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user context
    const { data: user, error: userError } = await supabaseClient
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      throw new Error('User not found')
    }

    // Check if today's protocol already exists (unless forcing new)
    if (!forceNew) {
  const { data: existingProtocols } = await supabaseClient
    .from('protocols')
    .select('*')
    .eq('user_id', userId)
    .eq('assigned_for_date', new Date().toISOString().split('T')[0])
    .is('completed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)  // ← Just get the most recent one

  if (existingProtocols && existingProtocols.length > 0) {
    return new Response(
      JSON.stringify({ 
        protocol: existingProtocols[0],
        message: 'Using existing protocol for today'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  }
}
    // Get recent protocols to avoid repetition
    const { data: recentProtocols } = await supabaseClient
      .from('protocols')
      .select('title, description')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)

    const recentTitles = recentProtocols?.map(p => p.title).join(', ') || 'none'

    // Build AI prompt
    const prompt = buildProtocolPrompt(user, recentTitles)

    // Call OpenAI to generate protocol
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are a neuroscience protocol designer. You MUST return ONLY valid JSON, nothing else. No markdown, no explanations, just pure JSON.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.9, // Higher creativity for variety
        max_tokens: 500,
      }),
    })

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text()
      throw new Error(`OpenAI API error: ${error}`)
    }

    const openaiData = await openaiResponse.json()
    let protocolJson = openaiData.choices[0].message.content.trim()

    // Clean up response (sometimes AI adds markdown)
    protocolJson = protocolJson.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    // Parse protocol
    const generatedProtocol: GeneratedProtocol = JSON.parse(protocolJson)

    // Validate protocol structure
    if (!generatedProtocol.title || !generatedProtocol.steps || generatedProtocol.steps.length === 0) {
      throw new Error('Invalid protocol structure from AI')
    }

    // Calculate total duration
    const totalDuration = generatedProtocol.steps.reduce((sum, step) => sum + step.durationSeconds, 0)

    // Save to database
    const { data: savedProtocol, error: insertError } = await supabaseClient
      .from('protocols')
      .insert({
        user_id: userId,
        title: generatedProtocol.title,
        description: generatedProtocol.description,
        steps: generatedProtocol.steps,
        duration_seconds: totalDuration,
        neuroscience_explanation: generatedProtocol.neuroscience,
        assigned_for_date: new Date().toISOString().split('T')[0]
      })
      .select()
      .single()

    if (insertError) {
      throw new Error(`Failed to save protocol: ${insertError.message}`)
    }

    return new Response(
      JSON.stringify({ 
        protocol: savedProtocol,
        message: 'New protocol generated successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in generate-protocol function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

// ============================================
// BUILD AI PROMPT FOR PROTOCOL GENERATION
// ============================================

function buildProtocolPrompt(user: any, recentTitles: string): string {
  const skillGuidance = getSkillLevelGuidance(user.skill_level)
  const struggleContext = getStruggleContext(user.main_struggle)

  return `Generate a personalized 5-minute neuroscience protocol for this user:

USER CONTEXT:
- Main Struggle: ${user.main_struggle}
- Skill Level: ${user.skill_level}
- Progress: ${user.rewire_progress}%
- Current Streak: ${user.current_streak} days

SKILL LEVEL GUIDANCE:
${skillGuidance}

STRUGGLE-SPECIFIC APPROACH:
${struggleContext}

RECENT PROTOCOLS (avoid repetition):
${recentTitles}

REQUIREMENTS:
1. Create a 5-minute protocol (300 seconds total)
2. Include 3-5 steps with specific timings
3. Each step should target specific neural mechanisms
4. Make it practical and easy to do anywhere
5. Vary the protocol type (breathing, movement, cognitive, sensory, mindfulness)
6. Title should be engaging and specific
7. Include brief neuroscience explanation (2-3 sentences)

STEP TYPES:
- breathing: Deep breathing, box breathing, etc.
- movement: Physical exercises, stretching, walking
- mindfulness: Meditation, body scans, present-moment awareness
- cognitive: Mental exercises, visualization, memory tasks
- sensory: Sensory grounding, environmental awareness

Return ONLY this JSON structure (no markdown, no extra text):

{
  "title": "Compelling protocol name",
  "description": "One engaging sentence about what this does",
  "durationSeconds": 300,
  "steps": [
    {
      "instruction": "Specific, clear instruction (what to do)",
      "durationSeconds": 60,
      "type": "breathing"
    },
    {
      "instruction": "Next step instruction",
      "durationSeconds": 120,
      "type": "movement"
    }
  ],
  "neuroscience": "2-3 sentences explaining the brain science behind this protocol and why it helps with ${user.main_struggle}"
}

Remember: Total duration must equal 300 seconds. Steps should flow logically.`
}

function getSkillLevelGuidance(level: string): string {
  const guidance: Record<string, string> = {
    'foggy': 'User is just starting. Make it VERY simple, gentle, and achievable. Focus on basic awareness and small wins. Avoid complexity.',
    'beginner': 'User has some experience. Include clear instructions with moderate engagement. Build confidence with achievable challenges.',
    'developing': 'User is building momentum. Can handle more complex protocols. Mix different modalities for variety.',
    'proficient': 'User is experienced. Can do advanced techniques. Challenge them with nuanced practices.',
    'rewired': 'User is a master. Give them sophisticated protocols that deepen their practice. They can handle complexity.'
  }
  return guidance[level] || guidance['beginner']
}

function getStruggleContext(struggle: string): string {
  const contexts: Record<string, string> = {
    'procrastination': 'Target: Prefrontal cortex activation, dopamine regulation. Focus on action initiation and overcoming inertia. Include movement to activate motor cortex.',
    'focus': 'Target: Attention networks, default mode network suppression. Use sensory anchors and present-moment awareness. Minimize decision fatigue.',
    'stress': 'Target: Parasympathetic activation, cortisol reduction. Emphasize breathing and body awareness. Create safety signals for the nervous system.',
    'anxiety': 'Target: Amygdala regulation, vagus nerve activation. Use grounding techniques and bilateral stimulation. Shift from threat to safety mode.',
    'motivation': 'Target: Dopamine pathways, reward anticipation. Include vision work and future self connection. Create momentum with small actions.',
    'sleep': 'Target: Circadian rhythm support, nervous system downregulation. Use progressive relaxation and light reduction cues.',
    'energy': 'Target: Mitochondrial function, alertness networks. Include movement and breath work that energizes without stress.'
  }
  
  // Try to match struggle with context, or default
  for (const [key, value] of Object.entries(contexts)) {
    if (struggle.toLowerCase().includes(key)) {
      return value
    }
  }
  
  return contexts['focus'] // Default fallback
}