import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface HackRequest {
  userId: string
}

// Helper to generate audio via TTS
async function generateAudio(text: string, voice: string = 'nova'): Promise<Uint8Array> {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice,
      speed: 0.90,
      response_format: 'mp3'
    }),
  })

  if (!response.ok) {
    throw new Error(`TTS API error: ${response.status}`)
  }

  const audioData = await response.arrayBuffer()
  return new Uint8Array(audioData)
}

// Generate pages 2-3 in background
async function generateRemainingAudioInBackground(
  supabaseClient: any,
  userId: string,
  dateStr: string,
  brainHack: any,
  taskId: string
) {
  try {
    console.log('🎙️ Generating pages 2-3 audio in background...')
    const texts = [
      `The neuroscience behind this hack: ${brainHack.neuroscience}. ${brainHack.personalization || ''}`,
      `Your action plan: ${brainHack.explanation}. Today's challenge: Apply this hack when you face ${brainHack.barrier} today.`
    ]

    const audioUrls: string[] = []
    
    for (let i = 0; i < texts.length; i++) {
      const pageNum = i + 2 // Pages 2 and 3
      console.log(`🔊 Generating audio for page ${pageNum}...`)
      const audioData = await generateAudio(texts[i], 'onyx')
      
      const fileName = `${userId}/${dateStr}/page${pageNum}.mp3`
      const { error: uploadError } = await supabaseClient.storage
        .from('audio-files')
        .upload(fileName, audioData, {
          contentType: 'audio/mpeg',
          upsert: true
        })
      
      if (!uploadError) {
        const { data: urlData } = supabaseClient.storage
          .from('audio-files')
          .getPublicUrl(fileName)
        
        audioUrls.push(urlData.publicUrl)
        console.log(`✅ Page ${pageNum} audio uploaded`)
      }
    }

    // Update with pages 2-3 URLs
    const updateData: any = {}
    if (audioUrls[0]) updateData.audio_page2_url = audioUrls[0]
    if (audioUrls[1]) updateData.audio_page3_url = audioUrls[1]

    if (Object.keys(updateData).length > 0) {
      await supabaseClient
        .from('daily_tasks')
        .update(updateData)
        .eq('id', taskId)
      
      console.log('✅ Pages 2-3 audio URLs saved')
    }
  } catch (error) {
    console.error('❌ Background audio error:', error)
  }
}

// Helper function to generate hack for a specific date
async function generateHackForDate(
  supabaseClient: any,
  userId: string,
  dateStr: string,
  user: any,
  recentHacks: string
) {
  const mainGoal = user.goal || user.main_goal || 'improve mental performance'
  const mainStruggle = user.biggest_struggle || user.main_struggle || 'staying focused'
  const progress = user.rewire_progress || 0
  const skillLevel = user.skill_level || 'beginner'

  const prompt = `You are Dr. Andrew Huberman meets a Stanford neuroscience researcher. Generate a cutting-edge, research-backed brain hack.

USER PROFILE:
- Main Goal: ${mainGoal}
- Primary Challenge: ${mainStruggle}
- Current Level: ${skillLevel}
- Progress: ${progress}%

RECENTLY USED (must be completely different): ${recentHacks}

CRITICAL INSTRUCTIONS FOR PERSONALIZATION:
The user's specific goal is: "${mainGoal}"
The ACTION ITEM (page 3) MUST be directly related to this goal.

EXAMPLES:
- If goal is "Build better habits" → Action item should involve habit formation
- If goal is "Overcome procrastination" → Action item should involve starting a task  
- If goal is "Reduce anxiety/stress" → Action item should involve calming techniques
- If custom goal provided → Action item should directly address that specific goal

REQUIREMENTS FOR THE HACK:
1. Must target a SPECIFIC brain mechanism (dopamine circuits, amygdala threat response, prefrontal cortex activation, default mode network, basal ganglia habit loops, etc.)
2. Must be based on ACTUAL neuroscience research (not generic productivity advice)
3. Must be practical and take 2-5 minutes to apply
4. Should feel advanced/cutting-edge, not something everyone already knows
5. Use technical language but explain it clearly

EXAMPLES OF GOOD HACKS (for reference, don't copy):
- "Dopamine Stacking Protocol": Do something enjoyable for 30 seconds immediately before the hard task to prime your reward circuits
- "Amygdala Bypass Breathing": 2 inhales through nose, 1 long exhale to activate parasympathetic system and reduce threat response
- "Prefrontal Priming Visualization": Spend 90 seconds mentally rehearsing the first step in vivid detail to activate motor planning circuits
- "Neurochemical State Shift": 10 jumping jacks + cold water on wrists to trigger norepinephrine release and shift brain state

GENERATE TWO PARTS:
PART 1 - QUOTE (for first screen):
A short, punchy, inspirational statement about the hack (1 sentence, max 15 words). Think of it like a mantra or daily affirmation.

PART 2 - DEEP DIVE (for second screen):
- Full step-by-step explanation (3-4 sentences)
- Specific neuroscience mechanism (2-3 sentences, name brain regions/neurotransmitters)
- Personalized connection to their goal: "${mainGoal}" (1-2 sentences on why THIS hack helps THEM specifically)

TARGET THEIR SPECIFIC CHALLENGE: ${mainStruggle}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "hackName": "Technical name (e.g., 'Prefrontal Activation Protocol')",
  "quote": "Short inspirational quote (max 15 words)",
  "explanation": "Full step-by-step instructions (3-4 sentences)",
  "neuroscience": "Deep dive into brain mechanism (2-3 sentences with specific regions/chemicals)",
  "personalization": "Why this helps YOUR specific goal: ${mainGoal} (1-2 sentences connecting DIRECTLY to their goal)",
  "barrier": "${mainStruggle}"
}`

  console.log('🤖 Calling OpenAI for date:', dateStr)
  
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
          content: 'You are a neuroscience coach. Return ONLY valid JSON, no markdown, no code blocks.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.9,
      max_tokens: 500,
    }),
  })

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text()
    console.error('❌ OpenAI error:', errorText)
    throw new Error('OpenAI API error: ' + openaiResponse.status)
  }

  const openaiData = await openaiResponse.json()
  let hackJson = openaiData.choices[0].message.content.trim()
  hackJson = hackJson.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const brainHack = JSON.parse(hackJson)

  console.log('✅ Hack generated for', dateStr, ':', brainHack.hackName)

  // Generate ONLY page 1 audio FIRST (blocking - wait for this)
  console.log('🎙️ Generating page 1 audio immediately...')
  const page1Text = `${brainHack.quote}. This is called: ${brainHack.hackName}`
  const page1Audio = await generateAudio(page1Text, 'onyx')
  
  // Upload page 1 audio
  const page1FileName = `${userId}/${dateStr}/page1.mp3`
  const { error: uploadError1 } = await supabaseClient.storage
    .from('audio-files')
    .upload(page1FileName, page1Audio, {
      contentType: 'audio/mpeg',
      upsert: true
    })
  
  let page1Url = null
  if (!uploadError1) {
    const { data: urlData } = supabaseClient.storage
      .from('audio-files')
      .getPublicUrl(page1FileName)
    page1Url = urlData.publicUrl
    console.log('✅ Page 1 audio ready:', page1Url)
  }

  // Save hack to database with page 1 audio
  const now = new Date().toISOString()
  const { data: insertData, error: insertError } = await supabaseClient
    .from('daily_tasks')
    .insert({
      user_id: userId,
      task_description: 'Daily Brain Hack',
      date: dateStr,
      brain_hack_applied: brainHack.hackName,
      hack_explanation: brainHack.explanation,
      hack_neuroscience: brainHack.neuroscience,
      hack_quote: brainHack.quote || brainHack.hackName,
      hack_personalization: brainHack.personalization || '',
      audio_page1_url: page1Url,
      audio_voice: 'nova',
      applied_at: now
    })
    .select()
    .single()

  if (insertError) {
    console.error('⚠️ Insert error:', insertError)
    throw insertError
  }

  const taskId = insertData.id
  console.log('💾 Hack saved with page 1 audio')

  // Generate pages 2-3 audio in background (non-blocking)
  generateRemainingAudioInBackground(supabaseClient, userId, dateStr, brainHack, taskId)

  // Return with page 1 audio URL
  return { ...brainHack, audioUrls: page1Url ? [page1Url] : [] }
}

// Main serve function
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId }: HackRequest = await req.json()
    console.log('📥 Request for userId:', userId)

    if (!userId) {
      throw new Error('Missing userId')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user context
    console.log('👤 Fetching user data...')
    const { data: user, error: userError } = await supabaseClient
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError) {
      console.error('❌ User fetch error:', userError)
      throw new Error('User not found: ' + userError.message)
    }

    console.log('✅ User found:', user.id)

    // Check if today's hack already exists
    const today = new Date().toISOString().split('T')[0]
    console.log('📅 Checking for existing hack for date:', today)

    const { data: todayHacks, error: existingError } = await supabaseClient
      .from('daily_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .limit(1)

    if (existingError) {
      console.error('⚠️ Existing hack check error:', existingError)
    }

    const todayHack = todayHacks && todayHacks.length > 0 ? todayHacks[0] : null

    // If today's hack exists, return it
    if (todayHack && todayHack.brain_hack_applied) {
      console.log('♻️ Returning existing hack:', todayHack.brain_hack_applied)
      return new Response(
        JSON.stringify({
          hackName: todayHack.brain_hack_applied,
          quote: todayHack.hack_quote || todayHack.brain_hack_applied,
          explanation: todayHack.hack_explanation,
          neuroscience: todayHack.hack_neuroscience,
          personalization: todayHack.hack_personalization || '',
          barrier: user.main_struggle || 'focus',
          isCompleted: !!todayHack.completed_at,
          audioUrls: [
            todayHack.audio_page1_url,
            todayHack.audio_page2_url,
            todayHack.audio_page3_url
          ].filter(Boolean)
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    // No hack exists for today - generate one NOW
    console.log('🆕 No hack for today, generating...')

    // Get recent hacks for variety
    const { data: recentHacks } = await supabaseClient
      .from('daily_tasks')
      .select('brain_hack_applied')
      .eq('user_id', userId)
      .not('brain_hack_applied', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5)

    const usedHacks = recentHacks?.map(h => h.brain_hack_applied).filter(Boolean).join(', ') || 'none'
    console.log('📜 Recent hacks:', usedHacks)

    // Generate hack for today (with page 1 audio ready)
    const generatedHack = await generateHackForDate(supabaseClient, userId, today, user, usedHacks)

    // Return the newly generated hack (page 1 audio ready, pages 2-3 generating in background)
    return new Response(
      JSON.stringify({
        hackName: generatedHack.hackName,
        quote: generatedHack.quote,
        explanation: generatedHack.explanation,
        neuroscience: generatedHack.neuroscience,
        personalization: generatedHack.personalization,
        barrier: generatedHack.barrier,
        isCompleted: false,
        audioUrls: generatedHack.audioUrls || []
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('❌❌ Fatal error:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.toString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})