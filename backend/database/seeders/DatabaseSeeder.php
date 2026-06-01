<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $seedUsers = [
            [
                'name' => 'Demo Admin',
                'email' => 'admin@demo.local',
                'password' => 'demo123',
                'phone' => '+8801911000000',
                'role' => 'admin',
                'billing_address' => 'Dhaka',
                'delivery_address' => 'Dhaka',
            ],
            [
                'name' => 'Demo Moderator',
                'email' => 'moderator@demo.local',
                'password' => 'demo123',
                'phone' => '+8801811000000',
                'role' => 'moderator',
                'billing_address' => 'Dhaka',
                'delivery_address' => 'Dhaka',
            ],
            [
                'name' => 'Rafi Ahmed',
                'email' => 'user@demo.local',
                'password' => 'demo123',
                'phone' => '+8801711000000',
                'role' => 'user',
                'billing_address' => 'Dhanmondi, Dhaka-1209',
                'delivery_address' => 'Gulshan-2, Dhaka-1212',
            ],
        ];

        foreach ($seedUsers as $row) {
            User::query()->updateOrCreate(
                ['email' => $row['email']],
                [
                    'name' => $row['name'],
                    'password' => Hash::make($row['password']),
                    'phone' => $row['phone'],
                    'role' => $row['role'],
                    'billing_address' => $row['billing_address'],
                    'delivery_address' => $row['delivery_address'],
                    'is_active' => true,
                ],
            );
        }

        $this->call(CatalogSeeder::class);
    }
}
