import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Root shell of the web app. */
@Component({
  selector: 'hs-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
export class App {}
