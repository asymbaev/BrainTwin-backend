import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  originalTransactionId: string
}

interface ResponseBody {
  userId: string
  exists: boolean
  userData?: any
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { originalTransactionId }: RequestBody = await req.json()

    if (!originalTransactionId) {
      throw new Error('Missing originalTransactionId')
    }

    console.log(`♻️ Restoring user from receipt: ${originalTransactionId}`)

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find user by receipt
    const { data: user, error: searchError } = await supabaseClient
      .from('users')
      .select('*')
      .eq('original_transaction_id', originalTransactionId)
      .maybeSingle()

    if (searchError) {
      console.error('❌ Search error:', searchError)
      throw searchError
    }

    if (!user) {
      console.log(`⚠️ No user found for receipt: ${originalTransactionId}`)
      
      const response: ResponseBody = {
        userId: '',
        exists: false
      }

      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update last accessed time
    await supabaseClient
      .from('users')
      .update({
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

    console.log(`✅ User restored: ${user.id}`)

    const response: ResponseBody = {
      userId: user.id,
      exists: true,
      userData: {
        name: user.name,
        age: user.age,
        goal: user.goal,
        main_struggle: user.main_struggle,
        skill_level: user.skill_level,
        is_premium: user.is_premium
      }
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})