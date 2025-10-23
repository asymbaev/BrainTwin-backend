import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TTSRequest {
  text: string
  voice?: string // "alloy", "echo", "fable", "onyx", "nova", "shimmer"
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text, voice = 'nova' }: TTSRequest = await req.json()

    if (!text) {
      throw new Error('Missing text parameter')
    }

    console.log('🎙️ Generating speech for text length:', text.length)

    // Call OpenAI TTS API
const response = await fetch('https://api.openai.com/v1/audio/speech', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'tts-1',  // Fast model (correct)
    input: text,
    voice: voice,
    speed: 1.2,  // INCREASED from 1.0 to 1.2 (20% faster speech + faster generation)
    response_format: 'mp3'  // Explicitly set format
  }),
})

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ OpenAI TTS error:', errorText)
      throw new Error('OpenAI TTS API error: ' + response.status)
    }

    // Get audio as binary
    const audioData = await response.arrayBuffer()

    console.log('✅ Audio generated, size:', audioData.byteLength, 'bytes')

    // Return audio file
    return new Response(audioData, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
      },
      status: 200,
    })

  } catch (error) {
    console.error('❌ Fatal error:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})