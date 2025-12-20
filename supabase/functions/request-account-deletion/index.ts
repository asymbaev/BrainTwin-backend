import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RequestBody {
  userId: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {} })
  }

  try {
    const { userId }: RequestBody = await req.json()

    if (!userId) {
      throw new Error('Missing userId')
    }

    console.log(`🗑️ Account deletion requested for user: ${userId}`)

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if user exists
    const { data: user, error: userError } = await supabaseClient
      .from('users')
      .select('id, account_status')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      throw new Error('User not found')
    }

    // Check if already pending deletion
    if (user.account_status === 'pending_deletion') {
      console.log(`⚠️ User ${userId} already has pending deletion`)
      return new Response(
        JSON.stringify({
          message: 'Account deletion already requested',
          deletionDate: null // Will be calculated from deletion_requested_at
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Mark account for deletion
    const deletionRequestedAt = new Date().toISOString()
    const { error: updateError } = await supabaseClient
      .from('users')
      .update({
        account_status: 'pending_deletion',
        deletion_requested_at: deletionRequestedAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (updateError) {
      console.error('❌ Failed to mark account for deletion:', updateError)
      throw updateError
    }

    // Calculate deletion date (14 days from now)
    const deletionDate = new Date()
    deletionDate.setDate(deletionDate.getDate() + 14)

    console.log(`✅ Account marked for deletion. Will be deleted on: ${deletionDate.toISOString()}`)

    return new Response(
      JSON.stringify({
        message: 'Account marked for deletion',
        deletionDate: deletionDate.toISOString(),
        gracePeriodDays: 14
      }),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})
