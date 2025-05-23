import { Injectable } from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslateService } from '@ngx-translate/core';
import {
  BehaviorSubject, Observable, combineLatest,
} from 'rxjs';
import { SystemUpdateOperationType, SystemUpdateStatus } from 'app/enums/system-update.enum';
import { extractApiErrorDetails } from 'app/helpers/api.helper';
import { SystemUpdateTrain, SystemUpdateTrains } from 'app/interfaces/system-update.interface';
import { DialogService } from 'app/modules/dialog/dialog.service';
import { TranslatedString } from 'app/modules/translate/translate.helper';
import { ApiService } from 'app/modules/websocket/api.service';
import { Package } from 'app/pages/system/update/interfaces/package.interface';
import { UpdateService } from 'app/pages/system/update/services/update.service';
import { ErrorHandlerService } from 'app/services/errors/error-handler.service';

@UntilDestroy()
@Injectable({
  providedIn: 'root',
})
export class TrainService {
  selectedTrain$ = new BehaviorSubject<string | undefined>(undefined);
  releaseTrain$ = new BehaviorSubject<boolean | undefined>(undefined);
  preReleaseTrain$ = new BehaviorSubject<boolean | undefined>(undefined);
  nightlyTrain$ = new BehaviorSubject<boolean | undefined>(undefined);
  currentTrainDescription$ = new BehaviorSubject<string>('');
  trainDescriptionOnPageLoad$ = new BehaviorSubject<string>('');
  fullTrainList$ = new BehaviorSubject<Record<string, SystemUpdateTrain> | undefined>(undefined);
  trainVersion$ = new BehaviorSubject<string | null>(null);

  trainValue$ = new BehaviorSubject<string>('');

  constructor(
    private updateService: UpdateService,
    private api: ApiService,
    private translate: TranslateService,
    private dialogService: DialogService,
    private errorHandler: ErrorHandlerService,
  ) {}

  getAutoDownload(): Observable<boolean> {
    return this.api.call('update.get_auto_download');
  }

  getTrains(): Observable<SystemUpdateTrains> {
    return this.api.call('update.get_trains');
  }

  onTrainChanged(newTrain: string, prevTrain: string): void {
    combineLatest([this.fullTrainList$, this.selectedTrain$, this.trainDescriptionOnPageLoad$])
      .pipe(untilDestroyed(this)).subscribe(([fullTrainList, selectedTrain, trainDescriptionOnPageLoad]) => {
        // For the case when the user switches away, then BACK to the train of the current OS
        if (newTrain === selectedTrain) {
          this.currentTrainDescription$.next(trainDescriptionOnPageLoad);
          this.setTrainAndCheck(newTrain, prevTrain);
          return;
        }

        let warning = '';
        if (fullTrainList?.[newTrain]?.description?.includes('[nightly]')) {
          warning = this.translate.instant('Changing to a nightly train is one-way. Changing back to a stable train is not supported! ');
        }

        this.dialogService.confirm({
          title: this.translate.instant('Switch Train'),
          message: warning + this.translate.instant('Switch update trains?') as TranslatedString,
        }).pipe(untilDestroyed(this)).subscribe((confirmSwitch: boolean) => {
          if (confirmSwitch) {
            this.setTrainDescription();
            this.setTrainAndCheck(newTrain, prevTrain);
          } else {
            this.trainValue$.next(prevTrain);
            this.setTrainDescription();
          }
        });
      });
  }

  setTrainDescription(): void {
    combineLatest([this.fullTrainList$, this.trainValue$])
      .pipe(untilDestroyed(this)).subscribe(([fullTrainList, trainValue]) => {
        if (fullTrainList?.[trainValue]) {
          this.currentTrainDescription$.next(fullTrainList?.[trainValue]?.description?.toLowerCase());
        } else {
          this.currentTrainDescription$.next('');
        }
      });
  }

  toggleAutoCheck(autoCheck: boolean): void {
    this.api.call('update.set_auto_download', [autoCheck])
      .pipe(
        this.errorHandler.withErrorHandler(),
        untilDestroyed(this),
      )
      .subscribe(() => {
        this.check();
      });
  }

  setTrainAndCheck(newTrain: string, prevTrain: string): void {
    this.updateService.isLoading$.next(true);
    this.api.call('update.set_train', [newTrain]).pipe(untilDestroyed(this)).subscribe({
      next: () => {
        this.check();
      },
      error: (error: unknown) => {
        this.errorHandler.showErrorModal(error);
        this.trainValue$.next(prevTrain);
        this.updateService.isLoading$.next(false);
      },
      complete: () => {
        this.updateService.isLoading$.next(false);
      },
    });
  }

  check(): void {
    // Reset the template
    this.updateService.updatesAvailable$.next(false);
    this.updateService.releaseNotesUrl$.next('');

    this.updateService.isLoading$.next(true);
    this.updateService.pendingUpdates();
    this.updateService.error$.next(false);
    sessionStorage.updateLastChecked = Date.now();

    combineLatest([
      this.api.call('update.check_available'),
      this.currentTrainDescription$,
    ]).pipe(untilDestroyed(this)).subscribe({
      next: ([update, currentTrainDescription]) => {
        if (update.version) {
          this.trainVersion$.next(update.version);
        }
        this.updateService.status$.next(update.status);
        if (update.status === SystemUpdateStatus.Available) {
          sessionStorage.updateAvailable = 'true';
          this.updateService.updatesAvailable$.next(true);

          const packages: Package[] = [];
          update.changes.forEach((change) => {
            if (change.operation === SystemUpdateOperationType.Upgrade) {
              packages.push({
                operation: 'Upgrade',
                name: change.old.name + '-' + change.old.version
                  + ' -> ' + change.new.name + '-'
                  + change.new.version,
              });
            } else if (change.operation === SystemUpdateOperationType.Install) {
              packages.push({
                operation: 'Install',
                name: change.new.name + '-' + change.new.version,
              });
            } else if (change.operation === SystemUpdateOperationType.Delete) {
              if (change.old) {
                packages.push({
                  operation: 'Delete',
                  name: change.old.name + '-' + change.old.version,
                });
              } else if (change.new) {
                packages.push({
                  operation: 'Delete',
                  name: change.new.name + '-' + change.new.version,
                });
              }
            } else {
              console.error('Unknown operation:', change.operation);
            }
          });
          this.updateService.packages$.next(packages);

          if (update.changelog) {
            this.updateService.changeLog$.next(update.changelog.replace(/\n/g, '<br>'));
          }

          if (update.release_notes_url) {
            this.updateService.releaseNotesUrl$.next(update.release_notes_url);
          }
        }
        if (currentTrainDescription?.includes('[release]')) {
          this.releaseTrain$.next(true);
          this.preReleaseTrain$.next(false);
          this.nightlyTrain$.next(false);
        } else if (currentTrainDescription.includes('[prerelease]')) {
          this.releaseTrain$.next(false);
          this.preReleaseTrain$.next(true);
          this.nightlyTrain$.next(false);
        } else {
          this.releaseTrain$.next(false);
          this.preReleaseTrain$.next(false);
          this.nightlyTrain$.next(true);
        }
        this.updateService.isLoading$.next(false);
      },
      error: (err: unknown) => {
        const apiError = extractApiErrorDetails(err);
        this.updateService.generalUpdateError$.next(
          `${apiError?.reason?.replace('>', '')?.replace('<', '')}: ${this.translate.instant('Automatic update check failed. Please check system network settings.')}`,
        );
        this.updateService.isLoading$.next(false);
      },
      complete: () => {
        this.updateService.isLoading$.next(false);
      },
    });
  }
}
