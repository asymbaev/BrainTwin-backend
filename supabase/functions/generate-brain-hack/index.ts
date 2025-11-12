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
      `Here's the brain hack: ${brainHack.neuroscience}. ${brainHack.personalization || ''}`,
      `Here's what to do: ${brainHack.explanation}. Today's challenge: Try this when you face ${brainHack.barrier} today.`
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

  const prompt = `You're a neuroscience coach who explains brain hacks like you're talking to a friend over coffee. Generate a SPECIFIC, actionable brain hack.

USER CONTEXT:
- Goal: ${mainGoal}
- Challenge: ${mainStruggle}
- Level: ${skillLevel}
- Recently used (make this COMPLETELY DIFFERENT): ${recentHacks}

YOUR MISSION: Create a brain hack that feels like discovering a secret cheat code for your mind.

WRITING STYLE RULES:
✅ DO: Write like a human. Use "your brain" not "the brain". Say "you're" not "one is".
✅ DO: Use simple words. Say "trick" not "mechanism". Say "boost" not "optimize neural transmission efficiency".
✅ DO: Make it feel like revealing a secret: "Here's what most people don't know..."
❌ DON'T: Sound like a textbook. No "crucial for executive functions" or "activates neural pathways associated with"
❌ DON'T: Use overly formal language. No "engaging this area" or "by revitalizing these pathways"
❌ DON'T: Just explain how something works. Give them a TRICK to exploit.

STRUCTURE:

PART 1 - THE HOOK (Page 1):
A punchy promise that sounds exciting, not generic. Make them curious.
❌ BAD: "Unlock your mind's potential and enhance your mental clarity"
✅ GOOD: "Trick your brain into loving hard work"
✅ GOOD: "Rewire anxiety in 90 seconds using breath"
✅ GOOD: "Turn invisible anxiety into visible action"

PART 2 - THE BRAIN HACK (Page 2):
Explain the psychological principle/trick in detail. This is ONLY the explanation - NO action steps yet.

🎯 FORMULA: [Surprising fact] + [Why it works] + [The psychology behind it] + [Why this matters for them]

CRITICAL: Write 5-6 sentences. Make it detailed and interesting. DO NOT include any "here's what to do" or action steps - those go in Part 3.

EXAMPLES OF GREAT BRAIN HACK EXPLANATIONS (Page 2 only - notice NO action steps):

Example 1 (Dopamine Hack):
"Your brain releases dopamine BEFORE you get a reward, not after - it's predicting the good feeling, which is why you get excited just thinking about pizza. This prediction system is how motivation actually works; your brain needs to expect something good to generate the energy to act. Here's the wild part: your brain can't tell the difference between a reward that comes from the activity itself versus a reward you artificially attach to it. If you consistently pair something enjoyable with a hard task, your dopamine system starts firing for the hard task because it's learned to predict the good feeling. This is literally how you manufacture motivation out of thin air - you're hijacking your brain's prediction algorithm. It's the same mechanism that makes Pavlov's dogs salivate at a bell."

Example 2 (Anxiety Kill Switch):
"Your brain's fear center (the amygdala) is surprisingly dumb - it responds to breathing patterns, not your thoughts or logic. When you're anxious, your breathing gets shallow and fast, which the amygdala reads as 'we're in danger, stay alert!' It's a feedback loop: anxiety changes your breath, your breath signals more danger. But here's the exploit: the amygdala will believe whatever your breathing tells it, even if you fake it. A specific breathing pattern - two sharp inhales through your nose followed by a long exhale - is a hardwired 'threat over' signal. Why? Because that's the exact pattern you breathe after crying, and your nervous system has evolved to interpret it as 'the stressful event has ended.' You can literally override your fear response by speaking your amygdala's language."

Example 3 (Pattern Interrupt):
"Your brain runs on autopilot 95% of the time because conscious thinking burns tons of energy. Every repeated action carves a deeper neural groove - like a path in the woods that gets easier to walk each time. The problem is, these grooves don't care if the habit is good or bad; your brain just wants to save energy. But here's the hack: autopilot needs everything to be the same. When something unexpected happens, your autopilot crashes for a split second, and your conscious brain has to take over. That split second is your window to choose differently. It's like finding a glitch in your brain's code. The more bizarre the interruption, the bigger the pause - your pattern-matcher literally doesn't know what to do with novelty."

Example 4 (Visualization Power):
"Your brain can't tell the difference between vividly imagining something and actually doing it - the same neurons fire in both cases. When you imagine lifting your arm in detail, your motor cortex lights up as if you're actually moving. This isn't just interesting; it's a performance cheat code. Athletes use this to practice without physical fatigue, and your brain builds the neural pathways either way. The key word is 'vividly' - vague daydreaming doesn't work, but detailed mental rehearsal where you feel the sensations and see it clearly creates real neural changes. You're essentially doing reps in your brain gym. The wild part? Your brain then recognizes the real action as familiar, making it easier to execute because you've already 'done' it."

Example 5 (Attention Filter Programming):
"Your brain has a filter called the reticular activating system that deletes 99% of what you see and hear - you'd go insane otherwise. It's like a bouncer at a club, only letting in what you've told it is important. When you decide you want something specific, you're programming this filter to highlight it. Ever notice how you suddenly see red cars everywhere after thinking about buying one? They were always there; your filter just started letting them through. This is the neuroscience behind why 'manifesting' sometimes works - not magic, just attention. The more specific you are about what you're looking for, the better your filter works. Your brain becomes a heat-seeking missile for opportunities you've been walking past every day."

WRITE IN THIS STYLE: Conversational, detailed (5-6 sentences), surprising, NO ACTION STEPS.

PART 3 - THE ACTION PLAN (Page 3):
Detailed, sophisticated action steps. Make it 5-6 sentences with specific, practical instructions that sound smart and actionable - NOT childish or silly.

❌ BAD: "Clap your hands twice when you lose focus" (sounds ridiculous)
❌ BAD: "Do 10 jumping jacks" (too simple, sounds like kindergarten)
❌ BAD: "Tap the table" (childish)

✅ GOOD: Specific, multi-step instructions that feel professional and actually useful

EXAMPLES OF SOPHISTICATED ACTION PLANS (5-6 sentences each):

Example 1 (Dopamine Stacking):
"Identify the exact moment you typically procrastinate on starting work - is it opening your laptop, starting a specific task, or sitting at your desk? Right before that moment, do something you genuinely enjoy for exactly 30 seconds: sip your favorite coffee, listen to 30 seconds of a song that energizes you, or look at a photo that makes you smile. The key is consistency - same enjoyable action, same timing, every single time. After 30 seconds, immediately transition into the work without any gap. Track this for one week and notice how your brain starts anticipating the work differently. After a week, you can reduce the pre-work activity to 10 seconds as the association strengthens."

Example 2 (Pattern Interrupt for Bad Habits):
"Choose the bad habit you want to break and identify the exact trigger point - the moment right before you reach for your phone, open social media, or grab junk food. At that trigger point, insert a completely unexpected physical disruption: stand up and walk to a different room, put on a specific song that requires you to stop what you're doing, or hold an ice cube for 10 seconds. The disruption must be unusual enough that your brain's autopilot can't ignore it. Do this every single time you catch the trigger for three days straight. Your brain will start pausing automatically at that trigger point, giving you a conscious choice instead of running the automatic program."

Example 3 (Anxiety Breathing Protocol):
"The moment you notice anxiety building - tight chest, racing thoughts, or shallow breathing - stop what you're doing completely. Take two sharp, quick inhales through your nose (like you're sniffing something twice quickly), then immediately exhale slowly through your mouth for a count of 5-8 seconds. The double inhale is critical - it needs to be two distinct sniffs, not one long breath. Repeat this breathing pattern 8-10 times consecutively, focusing only on the physical sensation of the breath. After completing the cycles, take 30 seconds to notice how your body feels different. Use this exact pattern every time you feel anxiety creeping in, and your nervous system will start responding faster each time."

Example 4 (Visualization Practice):
"Pick one specific task you've been avoiding and break it down to just the first 2 minutes of action - not the whole project, just the start. Close your eyes and spend 90 seconds mentally rehearsing those first 2 minutes in vivid detail: see yourself in the space where you'll do it, feel the physical sensations, hear the sounds, and watch yourself moving through each micro-step. Make it so detailed you could describe every movement. After the visualization, set a 2-minute timer and immediately do what you just imagined - don't think, just execute. Do this visualization-execution combo for the same task three days in a row. By day three, starting will feel eerily familiar because your brain has already practiced it multiple times."

Example 5 (Focus Filtering):
"Before starting any work session, write down one ultra-specific sentence describing exactly what success looks like for this session - not vague goals like 'make progress,' but concrete outcomes like 'draft the introduction section with three key points' or 'solve the first five client emails in my inbox.' Read this sentence out loud twice, emphasizing the specific words that define success. Place this written goal where you can see it throughout your work session. Set a timer for 25 minutes and work only on achieving that specific outcome, checking the goal statement whenever you feel your attention drifting. At the 25-minute mark, review what you accomplished against your specific statement, then decide whether to continue this task or switch. This trains your brain's attention filter to screen out everything except your defined target."

Example 6 (Morning Cognitive Priming):
"Within the first 15 minutes of waking up, before checking any devices, spend 5 minutes engaging with something intellectually challenging: read a dense article about a topic you're curious about, work through a logic puzzle, or study 10 new words in a language you're learning. The material should be genuinely difficult enough that you have to focus completely. After the 5 minutes, write down three observations or insights about what you just learned in your own words. This morning cognitive engagement activates your prefrontal cortex early, setting a baseline of mental sharpness for the rest of the day. Do this consistently for one week and notice how much easier it becomes to enter deep focus later in the day. The key is doing it before any dopamine-spiking activities like social media or news, which would hijack this priming effect."

WRITE ACTION PLANS LIKE THESE: Detailed (5-6 sentences), specific steps, sophisticated language, practical and actionable - NOT childish.

Return ONLY valid JSON:
{
  "hackName": "Cool name, not generic (e.g., 'Dopamine Hijack', 'Anxiety Kill Switch', '60-Second Mind Prep')",
  "quote": "Punchy hook that sounds exciting (max 12 words)",
  "neuroscience": "The brain hack explained in detail - 5-6 sentences, conversational tone, NO action steps, just the psychological principle and why it works",
  "explanation": "Detailed, sophisticated action plan - 5-6 sentences with specific, practical steps that sound professional and smart, NOT childish (no 'clap your hands' type stuff)",
  "personalization": "One sentence connecting this hack to their goal: ${mainGoal}",
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
          isCompleted: !todayHack.completed_at,
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