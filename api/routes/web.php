<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::view('/privacidade', 'privacy');
Route::view('/termos', 'terms');
