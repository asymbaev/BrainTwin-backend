import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Cron job to permanently delete accounts after 14-day grace period
 * Run daily via Supabase cron: 0 2 * * * (2 AM UTC)
 */

serve(async (req) => {
  try {
    console.log('🗑️ Starting permanent account deletion cron job...')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find accounts pending deletion where grace period has expired (14 days)
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const { data: usersToDelete, error: fetchError } = await supabaseClient
      .from('users')
      .select('id, email, name, deletion_requested_at')
      .eq('account_status', 'pending_deletion')
      .lt('deletion_requested_at', fourteenDaysAgo.toISOString())

    if (fetchError) {
      console.error('❌ Error fetching users to delete:', fetchError)
      throw fetchError
    }

    if (!usersToDelete || usersToDelete.length === 0) {
      console.log('✅ No accounts to delete')
      return new Response(
        JSON.stringify({
          message: 'No accounts to delete',
          deletedCount: 0
        }),
        {
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`📋 Found ${usersToDelete.length} account(s) to delete`)

    let successCount = 0
    let failureCount = 0

    // Delete each account and associated data
    for (const user of usersToDelete) {
      try {
        console.log(`🗑️ Deleting account: ${user.id} (${user.email || user.name || 'Unknown'})`)

        // Delete associated data in order (respecting foreign key constraints)

        // 1. Delete task completions
        const { error: completionsError } = await supabaseClient
          .from('task_completions')
          .delete()
          .eq('user_id', user.id)

        if (completionsError) {
          console.error(`❌ Error deleting completions for ${user.id}:`, completionsError)
        } else {
          console.log(`✓ Deleted task completions for ${user.id}`)
        }

        // 2. Delete daily tasks
        const { error: tasksError } = await supabaseClient
          .from('daily_tasks')
          .delete()
          .eq('user_id', user.id)

        if (tasksError) {
          console.error(`❌ Error deleting daily tasks for ${user.id}:`, tasksError)
        } else {
          console.log(`✓ Deleted daily tasks for ${user.id}`)
        }

        // 3. Delete paywall events (if table exists)
        const { error: paywallError } = await supabaseClient
          .from('paywall_events')
          .delete()
          .eq('user_id', user.id)

        if (paywallError && !paywallError.message.includes('does not exist')) {
          console.error(`❌ Error deleting paywall events for ${user.id}:`, paywallError)
        } else if (!paywallError) {
          console.log(`✓ Deleted paywall events for ${user.id}`)
        }

        // 4. Delete profile picture from storage (if exists)
        try {
          const { data: fileList } = await supabaseClient
            .storage
            .from('profile-pictures')
            .list('', {
              search: user.id
            })

          if (fileList && fileList.length > 0) {
            const filePaths = fileList.map(file => file.name)
            const { error: storageError } = await supabaseClient
              .storage
              .from('profile-pictures')
              .remove(filePaths)

            if (storageError) {
              console.error(`❌ Error deleting profile picture for ${user.id}:`, storageError)
            } else {
              console.log(`✓ Deleted profile picture for ${user.id}`)
            }
          }
        } catch (storageErr) {
          console.error(`❌ Storage error for ${user.id}:`, storageErr)
        }

        // 5. Finally, delete the user record
        const { error: userDeleteError } = await supabaseClient
          .from('users')
          .delete()
          .eq('id', user.id)

        if (userDeleteError) {
          console.error(`❌ Error deleting user ${user.id}:`, userDeleteError)
          failureCount++
        } else {
          console.log(`✅ Successfully deleted account: ${user.id}`)
          successCount++
        }

      } catch (error) {
        console.error(`❌ Unexpected error deleting ${user.id}:`, error)
        failureCount++
      }
    }

    console.log(`\n📊 Deletion Summary:`)
    console.log(`   ✅ Success: ${successCount}`)
    console.log(`   ❌ Failed: ${failureCount}`)
    console.log(`   📋 Total: ${usersToDelete.length}`)

    return new Response(
      JSON.stringify({
        message: 'Account deletion completed',
        deletedCount: successCount,
        failedCount: failureCount,
        totalProcessed: usersToDelete.length
      }),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('❌ Cron job error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})
