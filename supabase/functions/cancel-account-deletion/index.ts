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

    console.log(`♻️ Account deletion cancellation requested for user: ${userId}`)

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if user exists and is pending deletion
    const { data: user, error: userError } = await supabaseClient
      .from('users')
      .select('id, account_status, deletion_requested_at')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      throw new Error('User not found')
    }

    // Check if account is actually pending deletion
    if (user.account_status !== 'pending_deletion') {
      console.log(`⚠️ User ${userId} is not pending deletion (status: ${user.account_status})`)
      return new Response(
        JSON.stringify({
          message: 'Account is not pending deletion',
          currentStatus: user.account_status
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if grace period has expired (14 days)
    if (user.deletion_requested_at) {
      const deletionRequestDate = new Date(user.deletion_requested_at)
      const now = new Date()
      const daysSinceRequest = (now.getTime() - deletionRequestDate.getTime()) / (1000 * 60 * 60 * 24)

      if (daysSinceRequest > 14) {
        console.log(`❌ Grace period expired for user ${userId} (${daysSinceRequest.toFixed(1)} days ago)`)
        return new Response(
          JSON.stringify({
            error: 'Grace period expired. Account will be permanently deleted soon.'
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
    }

    // Reactivate account
    const { error: updateError } = await supabaseClient
      .from('users')
      .update({
        account_status: 'active',
        deletion_requested_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (updateError) {
      console.error('❌ Failed to cancel account deletion:', updateError)
      throw updateError
    }

    console.log(`✅ Account deletion cancelled for user: ${userId}`)

    return new Response(
      JSON.stringify({
        message: 'Account deletion cancelled successfully',
        accountStatus: 'active'
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
