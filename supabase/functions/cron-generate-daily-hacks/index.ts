// supabase/functions/cron-generate-daily-hacks/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface User {
  id: string
  email: string
  main_struggle: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('🕐 CRON JOB STARTED: Generating daily hacks for all users...')

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get today's date (for the hack we're generating)
    const today = new Date().toISOString().split('T')[0]
    console.log(`📅 Generating hacks for date: ${today}`)

    // STEP 1: Get all active users
    const { data: users, error: usersError } = await supabaseClient
      .from('users')
      .select('id, email, main_struggle')
      .order('created_at', { ascending: false })

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`)
    }

    if (!users || users.length === 0) {
      console.log('⚠️ No users found')
      return new Response(
        JSON.stringify({ success: true, message: 'No users to process', generatedCount: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`👥 Found ${users.length} users`)

    // STEP 2: For each user, generate their daily hack
    let successCount = 0
    let failCount = 0
    const results = []

    for (const user of users) {
      try {
        console.log(`\n🧠 Generating hack for user: ${user.email} (${user.id})`)

        // Check if hack already exists for today
        const { data: existingHack } = await supabaseClient
          .from('daily_tasks')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', today)
          .single()

        if (existingHack) {
          console.log(`✓ Hack already exists for ${user.email}, skipping`)
          results.push({ userId: user.id, status: 'skipped', reason: 'already_exists' })
          continue
        }

        // Call generate-brain-hack function
        const response = await supabaseClient.functions.invoke('generate-brain-hack', {
          body: { userId: user.id }
        })

        if (response.error) {
          throw new Error(response.error.message)
        }

        console.log(`✅ Successfully generated hack for ${user.email}`)
        successCount++
        results.push({ userId: user.id, status: 'success' })

      } catch (error) {
        console.error(`❌ Failed to generate hack for ${user.email}:`, error)
        failCount++
        results.push({ userId: user.id, status: 'failed', error: error.message })
      }
    }

    // STEP 3: Return summary
    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      date: today,
      totalUsers: users.length,
      successCount,
      failCount,
      results
    }

    console.log('\n📊 CRON JOB COMPLETED')
    console.log(`✅ Success: ${successCount}`)
    console.log(`❌ Failed: ${failCount}`)

    return new Response(
      JSON.stringify(summary),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('❌ CRON JOB FAILED:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})