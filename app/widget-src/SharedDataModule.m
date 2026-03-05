#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SharedDataModule, NSObject)

RCT_EXTERN_METHOD(syncToWidget:(NSString *)listName
                  items:(NSArray *)items
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(syncAllListsToWidget:(NSArray *)lists
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
